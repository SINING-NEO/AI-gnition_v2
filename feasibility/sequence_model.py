"""
Feasibility probe: when does a learned sequence model beat a median-gap rule?

Two synthetic worlds, same network. The network is a 2-layer MLP on the last
two purchases. It is the smallest learned sequence model that can use order-2
history. A transformer has to beat this before it earns a seat in the agent.

  stationary — next gap is always about 28 days.
  switching  — about 21 days if the last two SKUs match, about 42 if they switched.

Targets are trained as gap/40 so the output scale matches the 0/1 inputs.
Reported error is converted back to days.

The critic check is separate: a writer may name only a SKU the timeline tool
returned. A foreign token must be rejected, and a real one must pass.
"""

import math
import random
import json

SEED = 19
SKUS = ["house", "decaf", "oat", "filters"]
SCALE = 40.0


def mae(pairs):
    return sum(abs(p - y) for p, y in pairs) / len(pairs)


def make_history(rng, world):
    n = 8
    skus = [rng.choice(SKUS), rng.choice(SKUS)]
    gaps = []
    for i in range(n - 1):
        same = skus[-1] == skus[-2]
        if world == "stationary":
            gap = rng.gauss(28, 4)
        else:
            gap = rng.gauss(21 if same else 42, 3)
        gaps.append(max(7.0, gap))
        if i < n - 2:
            skus.append(rng.choice(SKUS))
    return skus, gaps


def features(skus, gaps):
    """Predict the final gap from everything before it."""
    prev, last = skus[-2], skus[-1]
    hist = gaps[:-1]
    med = sorted(hist)[len(hist) // 2]
    vec = []
    for sku in (prev, last):
        for name in SKUS[:-1]:
            vec.append(1.0 if sku == name else 0.0)
    vec.append(1.0 if last == prev else 0.0)
    vec.append(hist[-1] / SCALE)
    vec.append(med / SCALE)
    return vec, med, gaps[-1]


def dataset(world, n_customers, seed):
    rng = random.Random(seed)
    rows = []
    for _ in range(n_customers):
        skus, gaps = make_history(rng, world)
        x, med, y = features(skus, gaps)
        rows.append((x, y, med))
    return rows


def leaky(v):
    return v if v > 0 else 0.1 * v


class MLP:
    def __init__(self, sizes, rng):
        self.W = []
        self.b = []
        for n_in, n_out in zip(sizes[:-1], sizes[1:]):
            scale = math.sqrt(2.0 / n_in)
            self.W.append([[rng.gauss(0, scale) for _ in range(n_in)] for _ in range(n_out)])
            self.b.append([0.0] * n_out)

    def forward(self, x):
        pre = []
        acts = [x]
        h = x
        last = len(self.W) - 1
        for layer, (W, b) in enumerate(zip(self.W, self.b)):
            z = [b[j] + sum(W[j][i] * h[i] for i in range(len(h))) for j in range(len(b))]
            pre.append(z)
            h = z if layer == last else [leaky(v) for v in z]
            acts.append(h)
        return pre, acts

    def fit(self, rows, epochs=60, lr=0.15, batch=32, seed=1):
        rng = random.Random(seed)
        for _ in range(epochs):
            order = list(range(len(rows)))
            rng.shuffle(order)
            for start in range(0, len(order), batch):
                chunk = order[start : start + batch]
                grad_w = [
                    [[0.0] * len(self.W[l][0]) for _ in self.W[l]] for l in range(len(self.W))
                ]
                grad_b = [[0.0] * len(self.b[l]) for l in range(len(self.b))]
                for idx in chunk:
                    x, y_days, _ = rows[idx]
                    y = y_days / SCALE
                    pre, acts = self.forward(x)
                    delta = [acts[-1][0] - y]
                    for l in range(len(self.W) - 1, -1, -1):
                        h_prev = acts[l]
                        for j in range(len(delta)):
                            grad_b[l][j] += delta[j]
                            for i in range(len(h_prev)):
                                grad_w[l][j][i] += delta[j] * h_prev[i]
                        if l == 0:
                            break
                        z_below = pre[l - 1]
                        back = [0.0] * len(z_below)
                        for j in range(len(delta)):
                            for i in range(len(z_below)):
                                back[i] += self.W[l][j][i] * delta[j]
                        delta = [back[i] * (1.0 if z_below[i] > 0 else 0.1) for i in range(len(z_below))]
                scale = lr / len(chunk)
                for l in range(len(self.W)):
                    for j in range(len(self.W[l])):
                        self.b[l][j] -= scale * grad_b[l][j]
                        for i in range(len(self.W[l][j])):
                            self.W[l][j][i] -= scale * grad_w[l][j][i]

    def predict_days(self, x):
        _, acts = self.forward(x)
        return acts[-1][0] * SCALE


def eval_world(world):
    train = dataset(world, 1200, SEED)
    test = dataset(world, 400, SEED + 7)
    net = MLP([len(train[0][0]), 16, 16, 1], random.Random(SEED))
    net.fit(train)
    model_pairs = [(net.predict_days(x), y) for x, y, _ in test]
    median_pairs = [(med, y) for _, y, med in test]
    same = [p for p in model_pairs if abs(p[1] - 21) < abs(p[1] - 42)]
    return {
        "world": world,
        "train": len(train),
        "test": len(test),
        "mlpMaeDays": round(mae(model_pairs), 2),
        "medianMaeDays": round(mae(median_pairs), 2),
    }


def critic_check():
    rng = random.Random(SEED)
    foreign = "wool-coat"
    leaky = leaky_rejected = clean = clean_rejected = 0
    for _ in range(400):
        history = [rng.choice(SKUS) for _ in range(5)]
        if rng.random() < 0.5:
            mentioned = foreign
            leaky += 1
            if mentioned not in history:
                leaky_rejected += 1
        else:
            mentioned = history[-1]
            clean += 1
            if mentioned not in history:
                clean_rejected += 1
    return {
        "leakyDrafts": leaky,
        "leakyRejected": leaky_rejected,
        "cleanDrafts": clean,
        "cleanRejected": clean_rejected,
    }


def main():
    summary = {
        "seed": SEED,
        "model": "MLP hidden 16+16, leaky ReLU, target = next gap / 40, inputs = last two SKUs, switch flag, last gap, personal median",
        "worlds": [eval_world("stationary"), eval_world("switching")],
        "critic": critic_check(),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()

"""
Prototype of the retention agent.

Trains the same order-2 sequence network used in the feasibility probe, on a
mix of steady and product-dependent histories. Then walks five synthetic
customers through the loop:

  timeline -> sequence model -> planner -> policy -> writer -> critic -> reply

Nothing is sent. The script writes prototype/trace.json for the explainer page.
"""

import json
import random
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "feasibility"))

from sequence_model import MLP, SCALE, SKUS, dataset  # noqa: E402

AS_OF = date(2026, 10, 19)
LABELS = {
    "house": "House blend 250g",
    "decaf": "Decaf 250g",
    "oat": "Oat milk 1L",
    "filters": "Filter papers",
    "linen": "Linen shirt",
    "coat": "Wool coat",
    "tote": "Canvas tote",
    "scarf": "Silk scarf",
}


def next_features(skus, gaps):
    prev, last = skus[-2], skus[-1]
    med = sorted(gaps)[len(gaps) // 2]
    vec = []
    for sku in (prev, last):
        for name in SKUS[:-1]:
            vec.append(1.0 if sku == name else 0.0)
    vec.append(1.0 if last == prev else 0.0)
    vec.append(gaps[-1] / SCALE)
    vec.append(med / SCALE)
    return vec, med


def train_mixed():
    rows = dataset("stationary", 900, 19) + dataset("switching", 900, 23)
    net = MLP([len(rows[0][0]), 16, 16, 1], random.Random(19))
    net.fit(rows, epochs=50, lr=0.15, batch=32, seed=3)
    return net


def median(values):
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def timeline_for(customer, orders):
    skus = [order["sku"] for order in orders]
    dates = [date.fromisoformat(order["date"]) for order in orders]
    gaps = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
    counts = {}
    for sku in skus:
        counts[sku] = counts.get(sku, 0) + 1
    dominant = max(counts, key=counts.get)
    return {
        "customerId": customer["id"],
        "name": customer["name"],
        "consent": customer["consent"],
        "orders": [
            {"sku": order["sku"], "label": LABELS[order["sku"]], "date": order["date"]}
            for order in orders
        ],
        "gaps": gaps,
        "medianGap": median(gaps),
        "daysSinceLast": (AS_OF - dates[-1]).days,
        "dominantSku": dominant,
        "dominantLabel": LABELS[dominant],
        "dominantShare": round(counts[dominant] / len(skus), 2),
        "allowed": sorted(LABELS[sku] for sku in set(skus)),
    }


def place_orders(skus, gaps, days_since_last):
    last = AS_OF - timedelta(days=days_since_last)
    dates = [last]
    for gap in reversed(gaps):
        dates.append(dates[-1] - timedelta(days=int(gap)))
    dates.reverse()
    return [{"sku": sku, "date": when.isoformat()} for sku, when in zip(skus, dates)]


def plan(timeline, predicted):
    if len(timeline["orders"]) < 4:
        return "stay_quiet", "Fewer than four orders, so the sequence is too short to trust."
    if timeline["dominantShare"] < 0.6:
        return "stay_quiet", "No single product is at least 60% of the history."
    if not (14 <= predicted <= 45):
        return "stay_quiet", "The predicted gap sits outside a 14–45 day consumable cycle."
    days_until = predicted - timeline["daysSinceLast"]
    if -2 <= days_until <= 5:
        return "replenish", "The sequence model says the usual product is due now."
    if timeline["daysSinceLast"] > timeline["medianGap"] * 1.4:
        return "lapse", "They have been quiet longer than their own median gap."
    return "stay_quiet", "The usual product is not due yet."


def draft(timeline, job, predicted):
    last = timeline["orders"][-1]
    weeks = max(1, round(predicted / 7))
    if job == "replenish":
        text = (
            f"Your {last['label']} from {last['date']} usually lasts about {weeks} weeks. "
            "Same again?"
        )
    elif job == "lapse":
        text = (
            f"It has been {timeline['daysSinceLast']} days since your {last['label']} "
            f"on {last['date']}. Same again?"
        )
    else:
        text = ""
    return text


def critic(timeline, text):
    if not text:
        return {"accepted": True, "reasons": ["No draft, because the planner stayed quiet."]}
    reasons = []
    for label in LABELS.values():
        if label in text and label not in timeline["allowed"]:
            reasons.append(f"Names {label}, which is not in this timeline.")
    last = timeline["orders"][-1]
    if last["label"] not in text:
        reasons.append("Does not use the product from the latest order.")
    if last["date"] not in text:
        reasons.append("Does not use the latest order date.")
    if any(token in text.lower() for token in ("discount", "% off", "sale", "free")):
        reasons.append("Adds an offer that was not in the brief.")
    return {"accepted": not reasons, "reasons": reasons or ["Every product and date is in the timeline."]}


def policy(customer, job):
    if job == "stay_quiet":
        return {"action": "no_send", "reason": "Planner chose stay quiet.", "propensity": 0}
    if not customer["consent"]:
        return {"action": "suppress", "reason": "No current consent to email.", "propensity": 0}
    if customer["holdout"]:
        return {
            "action": "holdout",
            "reason": "Assigned to the 20% holdout. The message is stored and not sent.",
            "propensity": 0.2,
        }
    return {"action": "send", "reason": "Consented, and not in the holdout.", "propensity": 0.8}


def reply_for(customer, action):
    if action != "send":
        return {"label": "none", "text": "No message was sent, so there is no reply."}
    scripted = {
        "maya": ("buy", "Same again."),
        "sam": ("later", "Not yet — I still have some."),
    }
    label, text = scripted.get(customer["id"], ("none", ""))
    return {"label": label, "text": text}


def run_customer(net, spec):
    probe_orders = place_orders(spec["skus"], spec["gaps"], days_since_last=20)
    probe = timeline_for(spec, probe_orders)
    features, _ = next_features(spec["skus"], spec["gaps"])
    predicted = round(net.predict_days(features))
    days_since = spec.get("days_since")
    if days_since is None:
        days_since = predicted
    orders = place_orders(spec["skus"], spec["gaps"], days_since)
    timeline = timeline_for(spec, orders)
    job, because = plan(timeline, predicted)
    decision = policy(spec, job)
    text = draft(timeline, job, predicted) if decision["action"] != "no_send" else ""
    review = critic(timeline, text)
    poisoned = critic(timeline, "Your Wool coat from 2026-01-01 is due. 20% off.")
    return {
        "id": spec["id"],
        "name": spec["name"],
        "blurb": spec["blurb"],
        "predictedDays": predicted,
        "medianGap": timeline["medianGap"],
        "timeline": timeline,
        "planner": {"job": job, "because": because},
        "policy": decision,
        "draft": text,
        "critic": review,
        "poisonedDraft": poisoned,
        "reply": reply_for(spec, decision["action"]),
        "memory": memory_update(job, decision, reply_for(spec, decision["action"])),
    }


def memory_update(job, decision, reply):
    if decision["action"] == "holdout":
        return "Logged as holdout with propensity 0.2. No message. This row can train the uplift model later."
    if decision["action"] == "suppress":
        return "Suppressed for missing consent. Nothing is logged as a treatment."
    if decision["action"] == "no_send":
        return "Stayed quiet. No training row for uplift, because there was no eligible action."
    if reply["label"] == "buy":
        return "Reply labeled buy. Next action is a reorder link, then the loop stops."
    if reply["label"] == "later":
        return "Reply labeled later. The next check waits one median cycle."
    if reply["label"] == "stop":
        return "Reply labeled stop. Consent is cleared."
    return f"Job was {job}. Waiting on a purchase within 14 days."


def main():
    net = train_mixed()
    specs = [
        {
            "id": "maya",
            "name": "Maya",
            "blurb": "Buys the same oat milk on a steady cycle. The median and the network should agree.",
            "consent": True,
            "holdout": False,
            "skus": ["oat"] * 7,
            "gaps": [28, 27, 29, 28, 28, 30],
        },
        {
            "id": "sam",
            "name": "Sam",
            "blurb": "Alternates between two coffees, so neither product reaches 60% of the history. The planner stays quiet.",
            "consent": True,
            "holdout": False,
            "skus": ["house", "house", "decaf", "decaf", "house", "decaf"],
            "gaps": [22, 40, 21, 43, 20],
        },
        {
            "id": "noor",
            "name": "Noor",
            "blurb": "Fashion purchases with no repeated product. The planner should refuse a replenishment conversation.",
            "consent": True,
            "holdout": False,
            "days_since": 50,
            "skus": ["linen", "coat", "tote", "scarf"],
            "gaps": [108, 94, 121],
        },
        {
            "id": "priya",
            "name": "Priya",
            "blurb": "Same kind of history as Maya, assigned to the holdout so her purchases can be compared later.",
            "consent": True,
            "holdout": True,
            "skus": ["oat"] * 7,
            "gaps": [28, 29, 27, 28, 30, 28],
        },
        {
            "id": "jon",
            "name": "Jon",
            "blurb": "Due for a repeat, but there is no current consent, so the policy suppresses the send.",
            "consent": False,
            "holdout": False,
            "skus": ["filters"] * 6,
            "gaps": [30, 28, 31, 27, 29],
        },
    ]
    traces = [run_customer(net, spec) for spec in specs]
    payload = {
        "asOf": AS_OF.isoformat(),
        "model": "Mixed-world MLP, hidden layers 16 and 16, trained on 900 steady and 900 switching histories.",
        "customers": traces,
    }
    out = Path(__file__).with_name("trace.json")
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    js = Path(__file__).with_name("trace.js")
    js.write_text("window.TRACE = " + json.dumps(payload) + ";\n", encoding="utf-8")
    print(json.dumps({
        "wrote": str(out),
        "customers": [
            {
                "id": trace["id"],
                "predictedDays": trace["predictedDays"],
                "medianGap": trace["medianGap"],
                "job": trace["planner"]["job"],
                "action": trace["policy"]["action"],
                "critic": trace["critic"]["accepted"],
            }
            for trace in traces
        ],
    }, indent=2))


if __name__ == "__main__":
    main()

# Purchase timing prediction MVP

## Decision the model supports

The prediction system estimates **the number of days between a customer's latest purchase and their next purchase**.

That makes the core task a **regression problem** because the target is a continuous number of days. The predicted gap is converted into one of three operational states:

- `due_soon`: contact is timely
- `lapsed`: the customer is later than their normal cycle
- `stay_quiet`: do not contact the customer yet

These states are inputs to the chatbot workflow. They do not bypass consent, holdout, or human-handover rules.

## Why regression is the MVP model

Regression directly answers the timing question and works with the order-history fields that a retailer already holds. A small interpretable baseline should be tested before a neural network:

1. Personal median purchase gap
2. Ridge regression on recent purchase behaviour
3. The existing two-layer MLP only if it improves held-out error

Clustering may help explore customer groups, but a cluster does not predict when a person will purchase again. It is optional analysis, not the production trigger.

## Model inputs

The current synthetic experiment uses:

- previous product
- latest product
- whether the last two products match
- latest purchase gap
- personal median purchase gap

For a real pilot, add order count, days since last purchase, dominant-product share, average quantity, and channel consent. Do not use protected or unnecessary personal attributes.

## Role of AI

### Predictive AI

Predicts the expected next purchase gap. The prediction helps decide whether the customer is due, late, or not ready for a message.

### Generative AI in MantaGO

Uses approved customer and catalogue facts to phrase a short conversation, answer FAQs, and classify simple replies such as `reorder`, `later`, `stop`, or `human`.

### Ordinary rules

Rules, not AI, control consent, control-group assignment, suppression, approved complementary products, and human handover.

## Evaluation

- Primary model metric: mean absolute error in days on held-out customers
- Business metric: incremental repeat purchases within 14 days versus a holdout group
- Safety checks: no contact without consent and no product or offer outside the approved catalogue

Run the baseline comparison with:

```powershell
python prediction\baseline_regression.py
```

## Train models on the generated workbook

The workbook already contains a customer-level `dataset_split`. Keeping that
split prevents the same customer appearing in both training and test data.

Train the purchase-timing regression model and next-product classifier with:

```powershell
python prediction\train_models.py
```

The command writes these files to `prediction/artifacts/`:

- `purchase_timing_ridge.npz`: reusable timing model
- `next_product_softmax.npz`: reusable product classifier
- `metrics.json`: baseline and model test metrics
- `test_predictions.csv`: row-level held-out predictions for review

The regression model is compared with each customer's historical median gap.
The classifier is compared with predicting the most popular product and simply
repeating the customer's latest product. Top-3 accuracy is also reported because
the chatbot can rank a small set and then apply approved business rules.

## Prepare the pre-MantaGO campaign

After training, score the latest customer histories and apply the reviewable
policy in `policy_config.json`:

```powershell
python prediction\score_customers.py
```

This is a dry-run workflow. It does not send emails or call MantaGO. It writes
scored customers, selected customers, non-selected customers, a review-only
email queue, and token-to-landing-page context to `prediction/campaign_output/`.
The generated email addresses use the reserved `.example` domain and cannot be
delivered to real people. `campaign_history.json` begins empty; adding records
with `customer_id`, `sent_at`, and `status: "sent"` activates the configured
contact-cooldown rule on the next run.

The separate `send_campaign_email.py` utility can preview or send one approved
queue item to an explicitly supplied test inbox through SMTP. It never sends
to the fictional queue addresses. See the root `README.md` for configuration
and safety requirements.

The synthetic demo uses stable opaque tokens so links survive repeated local
runs. Production must replace them with server-side, signed, expiring tokens;
the static token map is not an authentication mechanism.

### Preview a selected customer's link

Start a local server from the project root:

```powershell
python -m http.server 8000
```

Then copy any `landing_url` from
`prediction/campaign_output/email_campaign_queue.json` into a browser. The page
at `prototype/recommendation.html` resolves the opaque token, shows the approved
reorder and upsell context, links to the demo source register, and exposes the
future MantaGO handoff boundary. Its chat panel is explicitly a placeholder;
replace it with the sponsor-provided MantaGO LiveChat embed after access is
granted.

Inventory and dated offers are treated as operational gates, not model
features. The pipeline rejects out-of-stock predictions, falls back only to an
available ranked product, and includes a discount only when the offer is active
on the workbook's as-of date. `mantago_ready_payload.json` contains the same
validated product, stock and price context but remains unsent until platform
credentials and client IDs are available.

## Knowledge pages for the chatbot

The local website now exposes stable, linkable sources:

- `prototype/faq.html` contains approved fictional answers for recommendations,
  stock, discounts, delivery, returns, opt-out and human support.
- `prototype/policies.html` contains the underlying stock, promotion, delivery,
  return, privacy and handover policies.
- `prototype/sources.html` records the provenance of catalogue, model,
  inventory, offer, FAQ and policy content.

These pages are suitable for demonstrating retrieval and citations. They are
not real company policies and must be replaced with sponsor-approved sources
before configuring MantaGO for production.

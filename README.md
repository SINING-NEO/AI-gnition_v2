# AI-gnition retention chatbot MVP

This project demonstrates how fictional customer purchase data can support a
personalised retention and upselling workflow before handing the conversation
to MantaGO.

No real customer or purchase records are used, and nothing is transmitted to
MantaGO. Campaign generation is a review-only dry run. A separate SMTP utility
can send exactly one controlled test email only when a test recipient,
credentials, send flag and confirmation phrase are all supplied.

## What the MVP demonstrates

- **Upsell:** predict a likely next product and show only an approved,
  in-stock complementary product.
- **Retention:** identify customers who are due soon or have passed their
  expected purchase cycle.
- **Safe targeting:** enforce consent, minimum history, contact cooldown,
  holdout and campaign-capacity rules outside the AI model.
- **Grounded support:** answer from approved catalogue, inventory, offers, FAQ
  and policy sources.
- **Human handover:** offer escalation when the customer asks for a person or
  the approved sources cannot support an answer.

## Updated end-to-end workflow

Legend: `[DONE]` is implemented in the local prototype. `[PLANNED]` requires
MantaGO access or a real business integration.

```text
[DONE] Synthetic customer, order and product data
                         ↓
[DONE] Predict next-purchase timing and likely next product
                         ↓
[DONE] Apply consent, contact-window, cooldown and holdout rules
                         ↓
[DONE] Check live-style inventory, price and active offers
                         ↓
[DONE] Select eligible customers and create a review-only email queue
                         ↓
[DONE] Human reviews and may send one controlled SMTP test email
                         ↓
[DONE] Test recipient follows a unique link to the local recommendation page
                         ↓
[PLANNED] Deploy the website and connect production campaign delivery
                         ↓
                 Is the customer known?
                    ┌────┴────┐
                   Yes        No
                    ↓          ↓
             [DONE] Show     [PLANNED] General
             validated       FAQ and product
             recommendation  guidance entry
                    └────┬─────┘
                         ↓
[PLANNED] Embedded MantaGO LiveChat receives approved customer context
                         ↓
[PLANNED] MantaGO answers from product, FAQ and policy sources
                         ↓
               Can it answer confidently?
                    ┌────┴────┐
                   Yes        No
                    ↓          ↓
             [PLANNED] Give  [PLANNED] Refer to
             answer with     a source or transfer
             source link     to a human agent
                         ↓
[PLANNED] Record outcome: purchase, later, opt-out or human escalation
```

The current site includes a chat-shaped preview so the complete customer
journey can be demonstrated. It is not connected to MantaGO and does not claim
to provide live chatbot responses.

## Completed in the current prototype

- Generated and validated fictional customer, order, product, inventory and
  offer data.
- Trained the purchase-timing regression and next-product classification
  models, including held-out evaluation.
- Added deterministic campaign rules for consent, purchase history, timing,
  cooldown, confidence, holdout and campaign capacity.
- Filtered recommendations against inventory and replaced unavailable products
  with an in-stock ranked alternative.
- Applied only offers active on the dataset's as-of date and passed validated
  price, stock and offer fields into downstream outputs.
- Produced a review-only email campaign queue with opaque customer landing
  tokens.
- Added an SMTP-capable single-recipient test sender. It defaults to a dry run,
  requires an explicit test inbox and never sends to synthetic `.example`
  addresses.
- Built the personalised landing page and source register.
- Added fictional MVP FAQ and policy pages with stable section links for future
  chatbot citations.
- Prepared a `mantago_ready_payload.json` file without transmitting it.
- Added visible paths for FAQ, policies, source references and requesting a
  human in the website demonstration.

## Expected additions

- Obtain the team's sponsor-approved MantaGO workspace access.
- Replace fictional FAQ, policies, catalogue details and business rules with
  sponsor-approved content.
- Add the real MantaGO LiveChat embed to the public website.
- Define how a verified business customer ID is safely associated with a
  MantaGO visitor; do not expose raw customer data in a browser URL.
- Send the minimum necessary recommendation context to MantaGO through its
  supported integration method.
- Configure grounded response flows, confidence/fallback behaviour and human
  agent routing inside MantaGO.
- Choose the sponsor's production email provider and replace the controlled
  single-recipient test mode only after message approval, consent checks and a
  production unsubscribe process are confirmed.
- Connect checkout or enquiry actions and record campaign outcomes for
  retention and repeat-purchase measurement.
- Add production security, signed expiring links, monitoring, access controls
  and privacy review.
- Run end-to-end tests with internal accounts before using any real customer
  information.

## Current data

The workbook in `data/retail_purchase_training_dataset.xlsx` contains:

- 3,000 synthetic customers
- 26,320 synthetic order lines
- 17,534 model-training examples
- 12 products
- 12 inventory records
- five dated offer records, of which three are active on 20 October 2026
- customer-level train, validation and test splits

The data generator validates identifiers, missing values, types, dates, order
values, inventory coverage, stock states and offer dates.

The ready-to-use workbook is committed to this repository. The JavaScript
source in `data/generate_training_dataset.mjs` documents the deterministic
generation and validation logic, but its workbook export function expects the
bundled spreadsheet artifact runtime rather than being a standalone Node.js
command.

## Models and results

`prediction/train_models.py` trains:

1. Ridge regression for `target_next_gap_days`
2. Multiclass logistic regression for `target_next_product_id`

Held-out results:

| Task | Baseline | Model |
|---|---:|---:|
| Purchase timing MAE | 10.19 days | 8.19 days |
| Next-product accuracy | 49.1% repeat-latest | 77.9% |
| Next-product top-three accuracy | — | 92.5% |

See `prediction/README.md` for model features, evaluation and artifact details.

## Targeting policy

`prediction/policy_config.json` controls the MVP campaign:

- minimum three orders
- product-confidence threshold of 55%
- contact window from five days before to seven days after predicted purchase
- lapsed threshold of more than ten days beyond the predicted purchase
- 14-day contact cooldown
- 20% deterministic holdout
- maximum 250 recipients per dry run

Inventory and offers are operational gates, not training features. The pipeline
replaces an out-of-stock prediction with an available ranked product and only
shows discounts active on the workbook as-of date.

## Repository structure

```text
data/
  generate_training_dataset.mjs       Synthetic data generation source
  retail_purchase_training_dataset.xlsx
prediction/
  train_models.py                     Train and evaluate both models
  score_customers.py                  Apply predictions and campaign rules
  send_campaign_email.py              Preview/send one controlled SMTP test
  policy_config.json                  Reviewable targeting thresholds
  artifacts/                          Trained weights, metrics and test output
  campaign_output/                    Scored and channel-ready JSON/CSV files
prototype/
  recommendation.html                 Personalised customer landing page
  faq.html / policies.html            Chatbot-ready knowledge sources
  sources.html                        Data and content provenance
requirements.txt                      Python runtime dependencies
.env.example                          Credential-free SMTP template
```

## Requirements and installation

- Python 3.10 or newer
- A modern browser
- Optional: an SMTP account for the single-email test
- Optional: MantaGO access for the planned live-chat integration

From the project root, create and activate a virtual environment if desired,
then install the Python dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

## Run the project

From the project root:

```powershell
python prediction\train_models.py
python prediction\score_customers.py
python -m http.server 8000
```

Keep the HTTP server running and open a `landing_url` from
`prediction/campaign_output/email_campaign_queue.json`.

Example with an active discounted upsell:

```text
http://localhost:8000/prototype/recommendation.html?t=669be7a354026e373a8b4c9083e8be9c
```

### Preview or send one test email

Preview a queued email without sending anything:

```powershell
python prediction\send_campaign_email.py `
  --customer-id C00018 `
  --test-recipient your-address@example.com
```

For an actual test, configure SMTP without committing passwords or app
passwords. Copy `.env.example` to `.env` and replace its placeholders. The
sender automatically loads this ignored local file without overriding values
already set in the PowerShell session. Alternatively, set the same values for
only the current PowerShell session:

```powershell
$env:SMTP_HOST = "smtp.example.com"
$env:SMTP_PORT = "587"
$env:SMTP_SECURITY = "starttls"
$env:SMTP_USERNAME = "your-smtp-username"
$env:SMTP_PASSWORD = "your-smtp-password-or-app-password"
$env:SMTP_FROM_EMAIL = "verified-sender@example.com"
$env:SMTP_FROM_NAME = "Pantry & Co. Prototype"
```

For Gmail, use `smtp.gmail.com`, port `587`, `starttls`, the complete Gmail
address as the username/from address, and a 16-character Google App Password
as `SMTP_PASSWORD`. Do not use or share the normal Google account password.

After reviewing the dry run, send exactly one controlled test email:

```powershell
python prediction\send_campaign_email.py `
  --customer-id C00018 `
  --test-recipient your-address@example.com `
  --send `
  --confirm-send SEND_ONE_TEST_EMAIL
```

The synthetic queue points to `localhost`, so its link only works on the
computer running the web server. After deploying the prototype, add
`--public-base-url https://your-public-site.example` to replace the local base
address while preserving the personalised path and token.

SMTP acceptance is recorded in the ignored file
`prediction/campaign_output/email_delivery_log.jsonl`. Acceptance means the
provider accepted the message; it does not prove inbox delivery or opening.

## Verification commands

Run these checks before a demo or pull request:

```powershell
python prediction\train_models.py
python prediction\score_customers.py
python prediction\send_campaign_email.py `
  --customer-id C00018 `
  --test-recipient test-recipient@example.com
node --check data\generate_training_dataset.mjs
git diff --check
```

The email command above is a dry run because it does not contain `--send`.

## Customer-facing prototype pages

- `prototype/recommendation.html` — personalised reorder and upsell landing page
- `prototype/faq.html` — chatbot-ready common questions with stable anchors
- `prototype/policies.html` — stock, offers, delivery, returns, privacy and
  human-handover policies
- `prototype/sources.html` — source register and provenance

The FAQ and policies are explicitly fictional MVP content. Replace them with
sponsor-approved business documents before any real deployment.

## Generated campaign outputs

`prediction/score_customers.py` writes:

- `scored_customers.json` — prediction and policy result for every customer
- `eligible_customers.json` — the selected review cohort
- `suppressed_customers.json` — all customers not selected, with reasons
- `email_campaign_queue.json` and `.csv` — synthetic messages and landing links
- `landing_context.json` — token-to-page context
- `mantago_ready_payload.json` — validated stock, price and offer context for
  future integration; it is not transmitted
- `campaign_summary.json` — counts and policy configuration

## MantaGO integration boundary

The prototype chat panel is not MantaGO. After sponsor access is granted:

1. Replace the preview panel with the supplied MantaGO LiveChat embed.
2. Upload or connect the approved FAQ, policies and product sources.
3. Bind business customer IDs to MantaGO client IDs.
4. Map each `conversation_goal` to a MantaGO flow.
5. Configure “Talk to a person,” unsupported-answer and sensitive-topic
   handover paths.
6. Test with internal accounts before enabling any real campaign.

## Important limitations

- All customer and merchandising data is synthetic.
- Demo email addresses use the reserved `.example` domain.
- The SMTP utility is limited to one explicit test recipient. It has no bulk
  sending, bounce/open/click tracking or production unsubscribe automation.
- No MantaGO credentials or customer client IDs are stored.
- Stable demo tokens are not production authentication. Production must use
  server-side signed, expiring, single-purpose tokens.
- The static JSON files are suitable only for a local demonstration.

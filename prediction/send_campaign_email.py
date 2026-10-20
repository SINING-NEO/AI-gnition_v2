"""Safely preview or send one campaign email through an SMTP provider.

The generated campaign contains fictional ``.example`` recipients. This tool
therefore requires an explicit real test recipient and never sends to the
address stored in the synthetic queue.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_QUEUE = PROJECT_ROOT / "prediction" / "campaign_output" / "email_campaign_queue.json"
DEFAULT_LOG = PROJECT_ROOT / "prediction" / "campaign_output" / "email_delivery_log.jsonl"
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"


def load_env_file(path: Path = DEFAULT_ENV_FILE) -> None:
    """Load simple KEY=VALUE settings without overriding the process environment."""
    if not path.exists():
        return

    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit(f"Invalid .env entry on line {line_number}; expected KEY=VALUE.")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value[:1] == value[-1:] and value.startswith(("'", '"')):
            value = value[1:-1]
        if not key or any(character.isspace() for character in key):
            raise SystemExit(f"Invalid .env variable name on line {line_number}.")
        os.environ.setdefault(key, value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview or send one approved prototype campaign email."
    )
    parser.add_argument(
        "--customer-id",
        required=True,
        help="Synthetic customer ID to select from the generated email queue.",
    )
    parser.add_argument(
        "--test-recipient",
        required=True,
        help="Real inbox used for this controlled test; the synthetic address is never used.",
    )
    parser.add_argument(
        "--public-base-url",
        help=(
            "Optional deployed website base, for example https://demo.example.com. "
            "It replaces http://localhost:8000 in the queued landing link."
        ),
    )
    parser.add_argument(
        "--send",
        action="store_true",
        help="Actually send through SMTP. Without this flag the command is a dry run.",
    )
    parser.add_argument(
        "--confirm-send",
        choices=["SEND_ONE_TEST_EMAIL"],
        help="Required together with --send to prevent accidental delivery.",
    )
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--log", type=Path, default=DEFAULT_LOG)
    return parser.parse_args()


def load_queue_item(queue_path: Path, customer_id: str) -> dict:
    with queue_path.open("r", encoding="utf-8") as handle:
        queue = json.load(handle)

    matches = [item for item in queue if item.get("customer_id") == customer_id]
    if not matches:
        raise SystemExit(f"Customer {customer_id!r} was not found in {queue_path}.")
    if len(matches) > 1:
        raise SystemExit(f"Customer {customer_id!r} appears more than once in the queue.")

    item = matches[0]
    if item.get("status") != "pending_review":
        raise SystemExit(
            f"Customer {customer_id!r} has status {item.get('status')!r}, not 'pending_review'."
        )
    if not item.get("recipient_is_synthetic"):
        raise SystemExit("This MVP sender only supports the controlled synthetic-data test flow.")
    return item


def replace_base_url(landing_url: str, public_base_url: str | None) -> str:
    if not public_base_url:
        return landing_url

    original = urlsplit(landing_url)
    replacement = urlsplit(public_base_url)
    if replacement.scheme not in {"http", "https"} or not replacement.netloc:
        raise SystemExit("--public-base-url must be an absolute HTTP or HTTPS URL.")

    base_path = replacement.path.rstrip("/")
    final_path = f"{base_path}{original.path}"
    return urlunsplit(
        (replacement.scheme, replacement.netloc, final_path, original.query, "")
    )


def update_plain_text(original: str, old_url: str, new_url: str) -> str:
    text = original.replace(old_url, new_url)
    return (
        f"{text}\n\n"
        "This is a prototype test email created with fictional customer data. "
        "Reply STOP if you do not want further test messages."
    )


def validate_recipient(recipient: str) -> str:
    if "\r" in recipient or "\n" in recipient:
        raise SystemExit("The test recipient must be one email address.")
    display_name, parsed = parseaddr(recipient)
    if display_name or parsed != recipient or parsed.count("@") != 1:
        raise SystemExit("--test-recipient must be one plain email address.")
    local_part, domain = parsed.rsplit("@", 1)
    if not local_part or not domain or "." not in domain:
        raise SystemExit("--test-recipient must contain a valid-looking email address.")
    return parsed


def build_message(item: dict, recipient: str, landing_url: str) -> EmailMessage:
    from_email = os.getenv("SMTP_FROM_EMAIL", "prototype@example.invalid")
    from_name = os.getenv("SMTP_FROM_NAME", "Pantry & Co. Prototype")
    plain_text = update_plain_text(item["plain_text"], item["landing_url"], landing_url)

    message = EmailMessage()
    message["Subject"] = f"[Prototype] {item['subject']}"
    message["From"] = formataddr((from_name, from_email))
    message["To"] = recipient
    message["Message-ID"] = make_msgid(domain=from_email.partition("@")[2] or None)
    message["X-Campaign-ID"] = item["campaign_id"]
    message["X-Synthetic-Customer-ID"] = item["customer_id"]
    message.set_content(plain_text)

    safe_subject = html.escape(item["subject"])
    intro = plain_text.split("http", 1)[0]
    safe_intro = html.escape(intro).replace("\n", "<br>")
    safe_url = html.escape(landing_url, quote=True)
    message.add_alternative(
        f"""\
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f7f1e7;color:#273126;font-family:Arial,sans-serif">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px">
      <div style="background:#fff;border:1px solid #dfd3bf;border-radius:16px;padding:28px">
        <p style="margin-top:0;color:#63705f;font-size:13px">PANTRY &amp; CO. · PROTOTYPE TEST</p>
        <h1 style="font-family:Georgia,serif;font-size:27px">{safe_subject}</h1>
        <p style="line-height:1.6">{safe_intro}</p>
        <p style="margin:28px 0">
          <a href="{safe_url}" style="background:#345b3c;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;display:inline-block">View recommendation</a>
        </p>
        <p style="font-size:12px;line-height:1.5;color:#6d746b">
          This is a prototype test email created with fictional customer data.
          Reply STOP if you do not want further test messages.
        </p>
      </div>
    </div>
  </body>
</html>
""",
        subtype="html",
    )
    return message


def smtp_settings() -> dict:
    required = ["SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_FROM_EMAIL"]
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise SystemExit("Missing SMTP environment variables: " + ", ".join(missing))

    host = os.environ["SMTP_HOST"]
    password = os.environ["SMTP_PASSWORD"]
    if host.lower() == "smtp.gmail.com":
        password = "".join(password.split())
        if len(password) != 16:
            raise SystemExit(
                "Gmail SMTP requires a 16-character Google App Password, "
                "not the normal account password. Update SMTP_PASSWORD in .env."
            )

    security = os.getenv("SMTP_SECURITY", "starttls").lower()
    if security not in {"starttls", "ssl"}:
        raise SystemExit("SMTP_SECURITY must be either 'starttls' or 'ssl'.")

    default_port = 465 if security == "ssl" else 587
    try:
        port = int(os.getenv("SMTP_PORT", str(default_port)))
    except ValueError as exc:
        raise SystemExit("SMTP_PORT must be an integer.") from exc

    return {
        "host": host,
        "port": port,
        "username": os.environ["SMTP_USERNAME"],
        "password": password,
        "security": security,
    }


def send_via_smtp(message: EmailMessage, settings: dict) -> None:
    context = ssl.create_default_context()
    if settings["security"] == "ssl":
        with smtplib.SMTP_SSL(
            settings["host"], settings["port"], context=context, timeout=30
        ) as server:
            server.login(settings["username"], settings["password"])
            server.send_message(message)
    else:
        with smtplib.SMTP(settings["host"], settings["port"], timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(settings["username"], settings["password"])
            server.send_message(message)


def append_delivery_log(log_path: Path, item: dict, recipient: str, message: EmailMessage) -> None:
    record = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "campaign_id": item["campaign_id"],
        "customer_id": item["customer_id"],
        "recipient": recipient,
        "status": "accepted_by_smtp",
        "message_id": message["Message-ID"],
        "mode": "single_test_recipient",
    }
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record) + "\n")


def main() -> None:
    args = parse_args()
    load_env_file()
    recipient = validate_recipient(args.test_recipient)
    item = load_queue_item(args.queue, args.customer_id)
    landing_url = replace_base_url(item["landing_url"], args.public_base_url)
    message = build_message(item, recipient, landing_url)

    if not args.send:
        print("DRY RUN - no email was sent")
        print(f"Synthetic customer: {item['customer_id']}")
        print(f"Test recipient: {recipient}")
        print(f"Subject: {message['Subject']}")
        print(f"Landing URL: {landing_url}")
        print("Add --send --confirm-send SEND_ONE_TEST_EMAIL after reviewing this preview.")
        return

    if args.confirm_send != "SEND_ONE_TEST_EMAIL":
        raise SystemExit(
            "Real delivery requires --send --confirm-send SEND_ONE_TEST_EMAIL."
        )

    settings = smtp_settings()
    send_via_smtp(message, settings)
    append_delivery_log(args.log, item, recipient, message)
    print(f"SMTP accepted one test email for {recipient}.")
    print(f"Delivery record appended to {args.log}.")


if __name__ == "__main__":
    main()

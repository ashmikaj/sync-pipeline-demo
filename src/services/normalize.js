function iso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function contact(record) {
  const p = record.properties || record;
  const name = [p.firstname || p.first_name, p.lastname || p.last_name]
    .filter(Boolean).join(" ") || p.name || null;
  return base("hubspot", record.id || record.contactId, "contact", record, {
    name, email: p.email || null, updated_at: iso(p.hs_lastmodifieddate || record.updatedAt),
  });
}

function payment(record) {
  return base("payments", record.id || record.transaction_id || record.transactionId || record._id, "payment", record, {
    name: record.customer_name || record.customer?.name || record.userId || null,
    email: record.customer_email || record.customer?.email || null,
    amount: Number(record.amount ?? (record.amount_cents ? record.amount_cents / 100 : 0)),
    currency: record.currency || null,
    updated_at: iso(record.updated_at || record.updatedAt || record.created_at || record.createdAt),
  });
}

function calendar(record) {
  return base("calendar", record.id, "event", record, {
    name: record.summary || "Untitled event",
    event_start: iso(record.start?.dateTime || record.start?.date),
    event_end: iso(record.end?.dateTime || record.end?.date),
    updated_at: iso(record.updated),
    deleted: record.status === "cancelled" ? 1 : 0,
  });
}

function base(source, source_id, record_type, raw, fields) {
  if (!source_id) throw new Error("record has no stable source id");
  return { source, source_id: String(source_id), record_type, raw_data: JSON.stringify(raw), ...fields };
}

function normalize(source, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("record is not an object");
  if (source === "hubspot") return contact(record);
  if (source === "payments") return payment(record);
  if (source === "calendar") return calendar(record);
  throw new Error(`unknown source: ${source}`);
}

module.exports = { normalize };

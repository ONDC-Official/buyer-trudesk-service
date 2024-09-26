const mongoose = require('mongoose')

const COLLECTION = 'issues'

const personSchema = new mongoose.Schema(
  {
    name: String,
  },
  { _id: false }
);

const contactSchema = new mongoose.Schema(
  {
    phone: Number,
  },
  { _id: false }
);

const complaintInfoSchema = new mongoose.Schema(
  {
    person: { type: personSchema },
    contact: { type: contactSchema },
  },
  { _id: false }
);

const IssueSchema = new mongoose.Schema(
  {
    userId: { type: String },
    transaction_id: { type: String },
    message_id: { type: String },
    category: { type: String },
    sub_category: { type: String },
    bppId: String,
    bpp_uri: String,
    complainant_info: { type: complaintInfoSchema },
    order_details: { type: Object },
    description: { type: Object },
    issue_actions: { type: Object },
    resolution: { type: Object, default: {} },
    resolution_provider: { type: Object, default: {} },
    orderId: { type: String },
    created_at: { type: String },
    updated_at: { type: String },
    issueId: { type: String },
    issue_status: { type: String, default: "Open" },
  },
  { _id: true, timestamps: false }
);

module.exports = mongoose.model(COLLECTION, IssueSchema)

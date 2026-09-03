# QuoteLens

### AI-Powered RFQ Creation, Processing, and Vendor Comparison

QuoteLens is an AI-powered procurement platform that simplifies the creation, processing, and comparison of **Requests for Quotation (RFQs)**.

Procurement teams often receive vendor quotes in inconsistent formats—including Excel spreadsheets, Word documents, PDFs, scanned images, and photographs. Reviewing these files manually and converting their contents into a comparable structure is slow, repetitive, and error-prone.

QuoteLens allows vendors to continue using their preferred formats while giving buyers a **standardized, evidence-backed view** of every response.

---

## ✨ Key Features

- **Conversational RFQ creation** using an AI copilot
- **Structured capture** of line items, specifications, delivery requirements, and questionnaires
- **Multi-format document processing** for Word, Excel, PDF, JPEG, JPG, and PNG files
- **Automatic vendor identification**
- **AI-powered line-item matching**
- **Commercial and fulfilment data extraction**
- **Currency, pricing-unit, and unit-of-measure normalization**
- **Confidence scores and source evidence** for extracted values
- **Side-by-side vendor comparison**
- **Natural-language analysis** with text, tables, charts, and exports
- **Line-item-level vendor selection**

---

## 🔍 The Problem

Vendor quotations rarely follow a consistent structure. Important information such as prices, discounts, specifications, taxes, delivery dates, and product availability may be scattered across different documents.

This forces procurement analysts to manually:

1. Open and review every vendor file.
2. Locate the required information.
3. Copy values into a comparison spreadsheet.
4. Convert currencies and pricing units.
5. Identify missing or incompatible data.
6. Compare vendors and select the best offer.

QuoteLens automates this workflow while preserving human review and approval.

---

## ⚙️ How It Works

1. **Create the RFQ**  
   The buyer describes the requirement to the AI copilot, which creates a structured RFQ.

2. **Invite vendors**  
   The RFQ and qualification questionnaire are issued to selected vendors.

3. **Receive responses**  
   Vendor quotations and questionnaires are uploaded in their original formats.

4. **Extract information**  
   AI identifies and structures product, commercial, fulfilment, and qualification data.

5. **Review uncertain values**  
   Missing, ambiguous, or low-confidence information is presented to the buyer for correction or approval.

6. **Normalize responses**  
   Pricing units, currencies, quantities, taxes, discounts, freight, and other charges are converted into comparable values.

7. **Compare vendors**  
   Approved responses appear in a side-by-side comparison.

8. **Analyze and award**  
   The buyer asks natural-language questions and selects the preferred vendor for each line item.

---

## 🧠 Transparent AI Normalization

QuoteLens keeps three layers of information for every normalized field:

| Layer | Description |
|---|---|
| **Buyer request** | What the buyer originally requested |
| **Vendor-stated value** | Exactly what the vendor submitted |
| **Normalized value** | The comparable value calculated by AI |

### Example

| Layer | Value |
|---|---|
| Buyer request | 500 A4 paper reams |
| Vendor response | ₹2,150 per carton, 5 reams per carton |
| Normalized result | ₹430 per ream |
| Confidence | 98% |
| Evidence | Vendor PDF, page 2, row 7 |

Every extracted or normalized value can include a **confidence score** and a reference to its supporting evidence.

---

## 📊 Vendor Comparison

The comparison view includes:

- Requested specifications and quantities
- Vendor quotations or missing-response status
- Normalized unit prices and comparable totals
- Product compliance and deviations
- Proposed substitutes
- Availability and delivery commitments
- Qualification questionnaire results
- Extraction confidence and source evidence

Comparison totals can incorporate:

- Taxes
- Discounts
- Freight
- Packing
- Insurance
- Installation or configuration charges
- Other applicable costs

---

## 💬 Natural-Language Analysis

Buyers can ask questions about the current RFQ and its vendor responses, such as:

- Which vendor offers the lowest comparable total?
- Which suppliers meet every mandatory specification?
- Which quote provides the earliest complete delivery?
- What information is missing from each response?
- Which vendor offers the best balance of price, compliance, and delivery?

Answers are generated from the extracted comparison data and can be presented as **text, tables, charts, or downloadable reports**.

---

## 🧪 Prototype Scope

The prototype demonstrates:

- **5 vendors**
- **30 RFQ line items**
- A vendor qualification questionnaire
- Multiple document and image formats
- At least one incomplete quotation
- At least one foreign-currency quotation
- At least one incompatible pricing unit
- At least one difficult image or photographed response
- Buyer correction and approval of extracted values
- Vendor selection at the individual line-item level

> **Note:** The prototype focuses specifically on RFQs. Email transport and related infrastructure may be simulated, but document extraction operates on the actual submitted files.

---

## 🎯 Project Goal

QuoteLens replaces fragmented comparison spreadsheets and manual document review with a **transparent, auditable, AI-assisted procurement workflow**.

It helps procurement teams compare offers faster while preserving the original vendor submissions, showing the reasoning behind normalized values, and keeping buyers in control of uncertain results.

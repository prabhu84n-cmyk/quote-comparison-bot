export type Uom = "piece" | "roll" | "sheet";

export interface RfqLineItem {
  lineNo: number;
  sku: string;
  category: string;
  subCategory: string;
  description: string;
  ply: number;
  specification: string;
  quantity: number;
  uom: string;
  /** Board weight per unit, used when a vendor quotes per kilogram. */
  kgPerUnit: number;
  deliveryLocation: string;
  requiredBy: string;
  substituteAllowed: boolean;
  mandatorySpec: string;
  notes: string;
}

export interface QuestionnaireItem {
  id: string;
  question: string;
  type: "boolean" | "number";
  /** Buyer's threshold: boolean expected value, or minimum acceptable number. */
  target: boolean | number;
  weight: number;
}

export interface Rfq {
  id: string;
  title: string;
  buyingOrganization: string;
  businessUnit: string;
  buyerContact: string;
  buyerEmail: string;
  productCategory: string;
  purpose: string;
  issueDate: string;
  questionsDeadline: string;
  submissionDeadline: string;
  expectedAwardDate: string;
  quoteValidity: string;
  deliveryLocation: string;
  expectedDeliveryDate: string;
  contractDuration: string;
  estimatedTotalQuantity: number;
  currency: string;
  taxable: boolean;
  partialQuotationAllowed: boolean;
  alternativeProductAllowed: boolean;
  partialAwardAllowed: boolean;
  submissionInstructions: string;
  lineItems: RfqLineItem[];
  questionnaire: QuestionnaireItem[];
}

export type SourceKind = "xlsx" | "pdf" | "docx" | "image" | "email";

export interface VendorInbox {
  id: string;
  name: string;
  shortName: string;
  from: string;
  subject: string;
  receivedAt: string;
  body: string;
  file: string;
  fileLabel: string;
  kind: SourceKind;
  hint: string;
}

/* ----------------------------------------------------------- AI extraction */

export interface StatedPrice {
  /** Number exactly as the vendor wrote it. */
  amount: number | null;
  /** ISO code as stated by the vendor, e.g. INR, USD. */
  currency: string | null;
  /** What one unit of that price covers. */
  basis: "per_unit" | "per_pack" | "per_kg" | "unknown";
  /** RFQ units contained in one pricing unit when basis is per_pack. */
  packQty: number | null;
  /** Verbatim pricing unit text from the document. */
  basisText: string | null;
}

export interface ExtractedLine {
  rfqLineNo: number | null;
  matchBasis: string;
  matchConfidence: number;
  vendorItemCode: string | null;
  quotedDescription: string | null;
  statedPrice: StatedPrice;
  lineDiscountPct: number | null;
  taxRatePct: number | null;
  compliance: "yes" | "no" | "partial" | "substitute" | "unknown";
  deviation: string | null;
  substitute: string | null;
  leadTimeDays: number | null;
  availableQty: number | null;
  moq: number | null;
  countryOfOrigin: string | null;
  confidence: number;
  evidence: string;
  issues: string[];
}

export interface ExtractedCharges {
  taxRatePct: number | null;
  taxIncludedInPrice: boolean;
  freightAmount: number | null;
  freightBasis: string | null;
  freightIncluded: boolean;
  packingAmount: number | null;
  insuranceAmount: number | null;
  insurancePctOfValue: number | null;
  installationAmount: number | null;
  orderLevelDiscountPct: number | null;
  earlyPaymentDiscount: string | null;
  volumeRebate: string | null;
  priceEscalation: string | null;
  paymentTerms: string | null;
  quoteValidity: string | null;
  currency: string | null;
  evidence: string;
}

export interface ExtractedFulfilment {
  partialDelivery: string | null;
  deliverySchedule: string | null;
  backOrderPolicy: string | null;
  replacementTurnaround: string | null;
  stockHeldLocally: string | null;
  supplyContinuity: string | null;
  deliveryCoverage: string | null;
}

export interface ExtractedQuestionnaireAnswer {
  id: string;
  answerText: string | null;
  answerBool: boolean | null;
  answerNumber: number | null;
  confidence: number;
  evidence: string;
}

export interface VendorExtraction {
  vendorId: string;
  model: string;
  extractedAt: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  /** Character/preview of the machine-readable text handed to the model. */
  sourceExcerpt: string;
  vendor: {
    legalName: string | null;
    registeredAddress: string | null;
    registrationDetails: string | null;
    taxRegistration: string | null;
    primaryContact: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  quoteRef: string | null;
  quoteDate: string | null;
  charges: ExtractedCharges;
  fulfilment: ExtractedFulfilment;
  lines: ExtractedLine[];
  questionnaire: ExtractedQuestionnaireAnswer[];
  overallConfidence: number;
  warnings: string[];
}

/* -------------------------------------------------------- normalized model */

export type CellState = "ok" | "assumed" | "missing" | "unmatched";

export interface NormalizedCell {
  vendorId: string;
  lineNo: number;
  state: CellState;
  /** Vendor-stated value, rendered verbatim. */
  statedText: string;
  /** Landed unit price in RFQ currency, incl. discounts, tax and allocated charges. */
  unitPriceLanded: number | null;
  /** Bare normalized unit price before tax and charges. */
  unitPriceNet: number | null;
  extendedTotal: number | null;
  confidence: number;
  evidence: string;
  compliance: ExtractedLine["compliance"];
  deviation: string | null;
  substitute: string | null;
  leadTimeDays: number | null;
  availableQty: number | null;
  shortSupply: boolean;
  notes: string[];
  raw?: ExtractedLine;
}

export interface QualificationResult {
  vendorId: string;
  score: number;
  maxScore: number;
  pct: number;
  qualified: boolean;
  answers: {
    id: string;
    question: string;
    stated: string;
    normalized: string;
    pass: boolean | null;
    weight: number;
    confidence: number;
    evidence: string;
  }[];
}

export interface VendorSummary {
  vendorId: string;
  name: string;
  linesQuoted: number;
  linesTotal: number;
  comparableTotal: number;
  coveredQuantityValue: number;
  avgConfidence: number;
  lowConfidenceLines: number;
  currencyConverted: boolean;
  qualification: QualificationResult;
}

export interface Comparison {
  currency: string;
  fx: Record<string, number>;
  cells: NormalizedCell[];
  summaries: VendorSummary[];
}

import type { VendorInbox } from "@/lib/types";

/**
 * The mock SMTP drop. Envelopes are simulated; the attachments underneath are
 * real files in /public/vendor-quotes and are what the AI actually reads.
 */
export const vendors: VendorInbox[] = [
  {
    id: "kavery",
    name: "Kavery Packaging Pvt Ltd",
    shortName: "Kavery",
    from: "sridhar@kaverypack.in",
    subject: "RFQ-2026-0417 — Kavery Packaging commercial offer (KPPL/Q/2026/1188)",
    receivedAt: "2026-08-26T11:14:00+05:30",
    body: "Dear Ms. Rao,\n\nPlease find attached our commercial offer against RFQ-2026-0417. Rates are in our standard workbook format. Charges and questionnaire responses are on separate sheets.\n\nRegards,\nSridhar Iyer\nKavery Packaging Pvt Ltd",
    file: "/vendor-quotes/kavery-packaging-quote.xlsx",
    fileLabel: "kavery-packaging-quote.xlsx",
    kind: "xlsx",
    hint: "Workbook, own column names, small cartons priced per bundle of 25",
  },
  {
    id: "shakti",
    name: "Shakti Corrugators Ltd",
    shortName: "Shakti",
    from: "rajesh.menon@shakticorrugators.co.in",
    subject: "Quotation SCL/BLR/2026/0904 against RFQ-2026-0417",
    receivedAt: "2026-08-27T16:02:00+05:30",
    body: "Ms. Rao,\n\nOur quotation is attached on letterhead. Kindly note the commercial notes on the last page of the rate section.\n\nRajesh Menon\nHead — Institutional Sales",
    file: "/vendor-quotes/shakti-corrugators-quote.pdf",
    fileLabel: "shakti-corrugators-quote.pdf",
    kind: "pdf",
    hint: "PDF on letterhead, priced per kilogram, extra discount buried in a footnote",
  },
  {
    id: "nirvana",
    name: "Nirvana Packaging Works",
    shortName: "Nirvana",
    from: "farah@nirvanapackaging.in",
    subject: "Re: RFQ-2026-0417 — offer from Nirvana Packaging Works",
    receivedAt: "2026-08-27T19:38:00+05:30",
    body: "Dear Ms. Rao,\n\nOur proposal is in the attached document. We have regretted three lines that fall outside our manufacturing scope.\n\nFarah Qureshi\nPartner — Sales",
    file: "/vendor-quotes/nirvana-packaging-quote.docx",
    fileLabel: "nirvana-packaging-quote.docx",
    kind: "docx",
    hint: "Word document, commercials written as prose, only 27 of 30 lines quoted",
  },
  {
    id: "pacific",
    name: "Pacific Pack Global Pte Ltd",
    shortName: "Pacific",
    from: "melissa.tan@pacificpack.sg",
    subject: "RFQ-2026-0417 rate card",
    receivedAt: "2026-08-28T09:21:00+08:00",
    body: "Hi Ananya,\n\nOur printed rate card — took a photo, our scanner is down. Prices are USD CIF Chennai.\n\nMelissa Tan\nPacific Pack Global Pte Ltd",
    file: "/vendor-quotes/pacific-pack-ratecard-photo.jpg",
    fileLabel: "pacific-pack-ratecard-photo.jpg",
    kind: "image",
    hint: "Phone photo of a printed rate card, taken at an angle. USD, per box of 100",
  },
  {
    id: "vindhya",
    name: "Vindhya Boxes & Cartons",
    shortName: "Vindhya",
    from: "prakash@vindhyaboxes.com",
    subject: "RE: RFQ-2026-0417 - Corrugated packaging annual requirement",
    receivedAt: "2026-08-28T19:42:00+05:30",
    body: "Rates in the mail body. Nothing attached.",
    file: "/vendor-quotes/vindhya-boxes-email.txt",
    fileLabel: "vindhya-boxes-email.txt",
    kind: "email",
    hint: "Plain email. Rates given per kilogram by ply, no line numbers at all",
  },
];

export const vendorById = (id: string) => vendors.find((v) => v.id === id);

# Backlog

## Technical

- Optimize invoice PDF generation reuse (`getCustomerInvoicePdf` and `createCustomerInvoiceReminder` both call `getCustomerInvoiceHtml` + `generateInvoicePdf`; reminder also reloads invoice, customer, emails, and payments that HTML generation already fetches).
- JS locals should be camelCase (`signingCode`, `fullName`, …). Today many handlers use snake_case locals that mirror DB/API field names (`signing_code`, `full_name`, …). Keep request/response JSON and SQL columns snake_case; rename local variables across the codebase to camelCase.

## Product

- Jira-type board
- Codebase and documentation feature
- Customer access and ticket creation
- Hosting, SMS, and WhatsApp services
- Role-based access
- Contractors: hold contractor records, record contractor payments, and include those payments in expenses (and revenue totals)
- Jobs: create open positions, accept job applications against them, and let people apply from the HammerByte website
- Single-point social media management
- Tender management: enter tender number, scan documents, and produce a summary table via OpenAI APIs
- Plan Docker management and deployment
- Hosting service: add hosting (or charges) as a billable service
- Contract generation for contractors and customers
- Quote generation for customers
- Mass mailing and offer sending for customers
- Secret manager: store company credentials and documents
- Storage service / CDN: connect with the site and store assets
- External apps: launch or link out to tools such as mailing, wiki, and similar apps
- SEO: rank HammerByte for IT services, digital product development, website design, and mobile application development (Google and ChatGPT). Landing page crawlability is the first step; later: dedicated service pages, local/business listings, and Search Console.
- LinkedIn automation: send personalized messages

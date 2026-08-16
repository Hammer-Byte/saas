# Backlog

## Technical

- Optimize invoice PDF generation reuse (`getCustomerInvoicePdf` and `createCustomerInvoiceReminder` both call `getCustomerInvoiceHtml` + `generateInvoicePdf`; reminder also reloads invoice, customer, emails, and payments that HTML generation already fetches).

## Product

- Jira-type board
- Codebase and documentation feature
- Customer access and ticket creation
- Hosting, SMS, and WhatsApp services
- Role-based access

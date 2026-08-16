# Backlog

- Optimize invoice PDF generation reuse (`getCustomerInvoicePdf` and `createCustomerInvoiceReminder` both call `getCustomerInvoiceHtml` + `generateInvoicePdf`; reminder also reloads invoice, customer, emails, and payments that HTML generation already fetches).

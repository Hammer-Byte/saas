import { createInquiry } from "../db/inquiries.js";

export async function addInquiry({ body, set }) {
    await createInquiry({
        full_name: body.full_name,
        phone: body.phone,
        email: body.email || null,
    });

    set.status = 201;
    return { message: "Inquiry submitted" };
}

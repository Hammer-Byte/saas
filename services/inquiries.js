import { createInquiry } from "../db/inquiries.js";

export async function addInquiry({ body, set }) {
    await createInquiry({
        full_name: body.full_name || null,
        phone: body.phone,
        email: body.email || null,
        source: body.source || null,
        institute_name: body.institute_name || null,
        city: body.city || null,
    });

    set.status = 201;
    return { message: "Inquiry submitted" };
}

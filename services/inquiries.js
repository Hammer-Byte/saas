import { createInquiry } from "../db/inquiries.js";

export async function addInquiry({ body, set }) {
    await createInquiry({ ...body, email: body.email || null });

    set.status = 201;
    return { message: "Inquiry submitted" };
}

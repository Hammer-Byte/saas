import transporter from "../libs/transporter.js";



export async function createMail({ body, set }) {
   

    //store into database
    
    transporter.transport(body);

    set.status = 201;
}

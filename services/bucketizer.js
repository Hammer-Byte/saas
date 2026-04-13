import { filer } from "@hammerbyte/utils";
import bucketizer from "../libs/bucketizer.js";



export async function bucketize({ body, set }) {

    const file = filer.generateRandomFileName().concat(`.${filer.getExtensionByFileName(body.file)}`);

    set.status = 201;
    
    return {
        file,
        urls: {
            get: bucketizer.get({ file, accumulator: body.accumulator }),
            put: bucketizer.put({ file, accumulator: body.accumulator }),
        }

    };
}

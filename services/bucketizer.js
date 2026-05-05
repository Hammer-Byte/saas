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

export async function getBucketized({ params, query }) {
    const get = bucketizer.get({
        file: params.file,
        accumulator: query.accumulator,
    });
    return { get };
}

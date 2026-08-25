import { filer } from "@hammerbyte/utils";
import bucketizer from "../libs/bucketizer.js";

export async function bucketize({ directory, body, set }) {
    const file = filer.generateRandomFileName().concat(`.${filer.getExtensionByFileName(body.file)}`);

    set.status = 201;

    return {
        file,
        urls: {
            get: bucketizer.get({ file: `${directory}/${file}`, accumulator: body.accumulator }),
            put: bucketizer.put({ file: `${directory}/${file}`, accumulator: body.accumulator }),
        },
    };
}

export async function getBucketized({ directory, params, query }) {
    const get = bucketizer.get({
        file: `${directory}/${params.file}`,
        accumulator: query.accumulator,
    });
    return { get };
}

import { filer, logger } from "@hammerbyte/utils";
import bucketizer from "../libs/bucketizer.js";
import {
    createFile,
    getFilesWithSizeZeroByApplicationServiceId,
    updateFileSizeById,
} from "../db/files.js";

export async function bucketize({ directory, body, set }) {
    const file = filer.generateRandomFileName().concat(`.${filer.getExtensionByFileName(body.file)}`);

    createFile({ application_service_id: directory, file });

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

export async function updateFileSizesByApplicationServiceId({ application_service_id }) {
    const files = await getFilesWithSizeZeroByApplicationServiceId({ application_service_id });

    await Promise.all(
        files.map(async (pendingFile) => {
            const bucketFile = `${pendingFile.application_service_id}/${pendingFile.file}`;

            try {
                if (!(await bucketizer.exists({ file: bucketFile }))) {
                    return;
                }

                const sizeInBytes = await bucketizer.size({ file: bucketFile });
                const size = sizeInBytes / 1024 ** 2;
                await updateFileSizeById({ id: pendingFile.id, size });
            } catch (error) {
                logger.error(`updateFileSizesByApplicationServiceId: ${bucketFile} — ${error}`);
            }
        }),
    );
}

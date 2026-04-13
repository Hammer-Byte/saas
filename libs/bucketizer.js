import { filer, CONSTANTS } from "@hammerbyte/utils";
import { S3Client } from "bun";

class Bucketizer {
    constructor() {
        if (Bucketizer.instance) {
            return Bucketizer.instance;
        }

        this.contaboConnector = ({
            accessKeyId: process.env.CONTABO_STORAGE_ACCESS_KEY,
            secretAccessKey: process.env.CONTABO_STORAGE_SECRET_KEY,
            tenant: process.env.CONTABO_TENANT,
            bucket: process.env.CONTABO_BUCKET_NAME,
            endpoint: process.env.CONTABO_BUCKET_REGION_URL,
        });

        Bucketizer.instance = this;
    }

    async init() {

        if (
            !this.contaboConnector.accessKeyId ||
            !this.contaboConnector.secretAccessKey ||
            !this.contaboConnector.tenant ||
            !this.contaboConnector.bucket ||
            !this.contaboConnector.endpoint
        ) {
            throw new Error("Contabo Connector is not configured");
        }

        this.bucketizer = new S3Client(this.contaboConnector);
        if (!await this.exists({ file: "healthcheck" })) {
            throw new Error("Contabo Connector healthcheck failed: healthcheck file not found");
        }
    }

    async exists({ file }) {
        return await this.bucketizer.file(file).exists();
    }

    get({ file, accumulator = CONSTANTS.SAAS.ACCUMULATORS.PRIVATE }) {
        return accumulator === CONSTANTS.SAAS.ACCUMULATORS.PRIVATE
            ? this.bucketizer.file(file).presign({ expiresIn: 3600 })
            : `${process.env.CONTABO_BUCKET_REGION_URL}/${process.env.CONTABO_TENANT}:${process.env.CONTABO_BUCKET_NAME}/${file}`;
    }


    put({ file, accumulator = CONSTANTS.SAAS.ACCUMULATORS.PRIVATE }) {
        return this.bucketizer.file(file).presign({
            expiresIn: 3600,
            method: "PUT",
            type: filer.getContentTypeByFileName(file),
            acl: accumulator,
        });
    }



}


const bucketizerInstance = new Bucketizer();
export default bucketizerInstance;
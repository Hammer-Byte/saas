export function createSeleniumJobContext({
    job,
    shouldAbort,
    setDriver,
    getDriver,
}) {
    return {
        job,
        payload: job?.payload || {},
        driver: null,
        resultSummary: null,
        errorMessage: null,
        aborted: false,
        shouldAbort() {
            return !!shouldAbort();
        },
        setDriver(driver) {
            this.driver = driver;
            if (typeof setDriver === "function") {
                setDriver(driver);
            }
        },
        getDriver() {
            if (typeof getDriver === "function") {
                return getDriver() || this.driver;
            }
            return this.driver;
        },
        setResultSummary(summary) {
            this.resultSummary =
                summary == null ? null : String(summary).slice(0, 2000);
        },
        setErrorMessage(message) {
            this.errorMessage =
                message == null ? null : String(message).slice(0, 4000);
        },
    };
}

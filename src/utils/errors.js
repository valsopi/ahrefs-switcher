export class AppError extends Error {
	constructor(code, message) { super(message); this.code = code; }
}
export function requireThat(condition, code, message) {
	if (!condition) throw new AppError(code, message);
}
export function publicError(error) {
	return error instanceof AppError ? {code: error.code, message: error.message} :
		{code: 'API_ERROR', message: 'A browser or storage operation failed. Check extension permissions and try again.'};
}

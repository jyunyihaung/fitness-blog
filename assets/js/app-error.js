const SAFE_MESSAGES = {
  authorization_cancelled: "操作已取消，你可以再試一次。",
  authorization_expired: "Google 授權已過期，請重新連線。",
  permission_denied: "目前 Google 帳號沒有存取這份試算表的權限。",
  not_found: "找不到指定的 Google Sheet，請重新選擇檔案。",
  rate_limited: "Google API 暫時忙碌，請稍後再試。",
  network_error: "目前無法連線到 Google 服務，請檢查網路後重試。",
  invalid_schema: "這份試算表與目前版本不相容，請到設定頁檢查或修復結構。",
  google_api_error: "Google 服務暫時無法完成操作，請稍後再試。",
  configuration_error: "網站的 Google 服務設定不完整，請聯絡網站管理者。",
};

export class AppError extends Error {
  constructor(code, options = {}) {
    super(SAFE_MESSAGES[code] ?? SAFE_MESSAGES.google_api_error, { cause: options.cause });
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function safeErrorMessage(error, fallback = SAFE_MESSAGES.google_api_error) {
  if (error?.name === "AbortError") return SAFE_MESSAGES.authorization_cancelled;
  if (error instanceof AppError) return error.message;
  return fallback;
}

export function reportAppError(operation, error) {
  // Never log the Error object: Google API errors retain the raw response in
  // `cause` for classification, and production logs must not expose it.
  console.error("Application operation failed.", {
    operation,
    code: error instanceof AppError ? error.code : "unexpected_error",
    status: error instanceof AppError ? error.status : null,
    retryable: error instanceof AppError ? error.retryable : false,
  });
}

export function googleApiError(status, cause) {
  if (status === 401) return new AppError("authorization_expired", { status, cause });
  if (status === 403) return new AppError("permission_denied", { status, cause });
  if (status === 404) return new AppError("not_found", { status, cause });
  if (status === 429) return new AppError("rate_limited", { status, retryable: true, cause });
  return new AppError("google_api_error", { status, retryable: status >= 500, cause });
}

export function schemaError() {
  return new AppError("invalid_schema");
}

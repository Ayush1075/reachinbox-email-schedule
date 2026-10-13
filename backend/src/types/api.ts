/** Response envelope shared by every endpoint (mirrored in frontend/src/types/api.ts). */
export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: { code: string; message: string; details?: unknown } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type Paginated<T> = { items: T[]; page: number; limit: number; total: number };

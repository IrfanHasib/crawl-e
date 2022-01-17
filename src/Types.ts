export type ErrorType = Error | undefined | null
export type Callback<T> = (err: ErrorType, result?: T) => void
export type ListParsingCallback<T> = (err: ErrorType, result?: T[], nextPageUrl?: string) => void
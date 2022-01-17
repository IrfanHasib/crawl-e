export declare type ErrorType = Error | undefined | null;
export declare type Callback<T> = (err: ErrorType, result?: T) => void;
export declare type ListParsingCallback<T> = (err: ErrorType, result?: T[], nextPageUrl?: string) => void;

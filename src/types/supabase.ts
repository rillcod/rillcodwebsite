export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export interface Database {
    public: {
        Tables: Record<string, {
            Row: any;
            Insert: any;
            Update: any;
        }>;
        Views: Record<string, {
            Row: any;
            Insert: any;
            Update: any;
        }>;
        Functions: {
            [_ in never]: never;
        };
        Enums: {
            [_ in never]: never;
        };
    };
}

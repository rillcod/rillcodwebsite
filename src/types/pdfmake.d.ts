declare module 'pdfmake' {
    const printer: any;
    export default printer;
}

declare module 'pdfmake/interfaces' {
    export type TDocumentDefinitions = any;
}

declare module 'pdfmake/fonts/Roboto' {
    export const Roboto: {
        normal: string;
        bold: string;
        italics: string;
        bolditalics: string;
    };
}

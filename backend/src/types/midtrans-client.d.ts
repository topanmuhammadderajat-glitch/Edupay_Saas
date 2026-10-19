declare module 'midtrans-client' {
  type Credentials = { isProduction: boolean; serverKey: string; clientKey: string };
  type HttpClient = { httpClient: { http_client: { defaults: { timeout: number; headers: { common: Record<string,string> } } } } };
  export default class Midtrans {
    static Snap: new (config: Credentials) => HttpClient & { createTransaction(parameters: unknown): Promise<unknown> };
    static CoreApi: new (config: Credentials) => HttpClient & { transaction: { status(orderId: string): Promise<unknown> } };
  }
}

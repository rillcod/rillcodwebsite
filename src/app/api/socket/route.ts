export const dynamic = 'force-dynamic';

export async function GET(req: any, res: any) {
    // App Router route handlers do not expose a stable Node response/socket
    // for Socket.IO bootstrapping. Keep endpoint explicit to avoid false health.
    return new Response(
        'Socket initialization via App Router is not supported. Use a dedicated realtime server.',
        { status: 501 }
    );
}

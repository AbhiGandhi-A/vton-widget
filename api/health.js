export default function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        hf_token_configured: !!process.env.HF_TOKEN
    });
}

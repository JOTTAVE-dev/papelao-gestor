export default function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Metodo nao permitido.' });
  }

  const texto = typeof request.body?.texto === 'string' ? request.body.texto.trim() : '';

  if (!texto) {
    return response.status(400).json({ error: 'Informe o texto do lancamento.' });
  }

  return response.status(200).json({
    ok: true,
    mensagem: 'Texto recebido com sucesso.',
    texto,
  });
}

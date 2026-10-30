# Guia da API Lumen

A Lumen é uma plataforma de pagamentos. Este guia cobre autenticação, limites de
requisições e erros, em português.

## Autenticação

A Lumen usa OAuth com credenciais de cliente. Faça uma requisição para
`POST /auth/token` com o seu identificador e a sua chave secreta para obter um
token de acesso.

A resposta contém um `access_token` válido por **3600 segundos**. Envie esse
token em todas as requisições seguintes no cabeçalho `Authorization`.

Uma requisição sem token, ou com um token expirado, retorna `401` com o código
`unauthenticated`. A Lumen não emite tokens de renovação, então renovar
significa chamar `POST /auth/token` novamente antes da expiração.

### Rotação de segredos

Crie o novo segredo primeiro, publique a sua aplicação e só então revogue o
antigo. Os dois funcionam ao mesmo tempo durante a troca, portanto não é
necessário tirar o serviço do ar.

## Limites de requisições

Cada cliente pode fazer **120 requisições por minuto**. Ao ultrapassar o limite,
a resposta é `429` com o código `rate_limited` e um cabeçalho `Retry-After`
informando quantos segundos esperar.

Não tente novamente de imediato: a tentativa falhará igualmente e ainda contará
para a janela seguinte. Use uma espera exponencial com variação aleatória.

## Paginação

As coleções são paginadas por cursor. Informe `limit` e `cursor`; a resposta
traz `next_cursor`, que é nulo na última página. O cursor é opaco e não deve ser
interpretado nem construído manualmente.

## Faturas

Uma fatura é criada como rascunho e pode ser editada livremente. Depois de
finalizada, recebe um número sequencial e não pode mais ser alterada.

Uma fatura paga **não** pode ser cancelada. Para reverter uma cobrança já paga,
emita uma nota de crédito.

## Erros

Toda resposta com erro tem o mesmo formato, com um `code` estável, uma `message`
destinada a pessoas e um `request_id` que deve ser informado ao pedir suporte.

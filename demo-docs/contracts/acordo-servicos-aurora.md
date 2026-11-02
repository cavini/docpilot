_Documento de exemplo. Lumen Pagamentos Ltda. e Aurora Varejo S.A. foram
inventadas para esta demonstração, e nada do que segue é orientação jurídica nem
serve para uso real._

# Contrato de Prestação de Serviços de Pagamento

Este Contrato de Prestação de Serviços (o "Contrato") é celebrado em 1º de abril
de 2026 (a "Data de Início") entre **Lumen Pagamentos Ltda.**, inscrita no CNPJ
sob o nº 11.222.333/0001-44, com sede na Avenida das Nações 2200, São Paulo, SP
("Lumen"), e **Aurora Varejo S.A.**, inscrita no CNPJ sob o nº
55.666.777/0001-88, com sede na Rua do Comércio 410, Campinas, SP ("Cliente").
Lumen e Cliente são designadas individualmente como "Parte" e em conjunto como
"Partes".

## 1. Definições

**1.1** "Plataforma" significa a plataforma de pagamentos da Lumen, sua
interface de programação de aplicações e o painel disponibilizado nos endereços
que a Lumen publicar.

**1.2** "Dados do Cliente" significa todos os dados enviados à Plataforma pelo
Cliente ou em seu nome, incluindo registros de transações, tokens de meios de
pagamento e dados de contato de consumidores finais.

**1.3** "Volume Transacionado" significa o valor bruto dos pagamentos capturados
com sucesso pela Plataforma em um mês civil, deduzidos os estornos liquidados no
mesmo mês.

**1.4** "Horário Comercial" significa das 09h00 às 18h00, horário de Brasília,
em dias que não sejam sábado, domingo ou feriado nacional.

## 2. Dos serviços

**2.1 Escopo.** A Lumen disponibilizará a Plataforma ao Cliente para aceitar,
liquidar e conciliar pagamentos, nos termos deste Contrato e da documentação que
a Lumen publicar.

**2.2 Acesso à API e limites de requisições.** O Cliente poderá chamar a API da
Plataforma com as credenciais que lhe forem emitidas. A Lumen aplica um limite
de **120 requisições por minuto** por conjunto de credenciais. As requisições
que ultrapassarem esse limite são recusadas com status `429`, e tal recusa não
caracteriza indisponibilidade da Plataforma para os fins da Cláusula 6.

**2.3 Alterações na Plataforma.** A Lumen poderá alterar a Plataforma a qualquer
tempo, desde que nenhuma alteração remova funcionalidade documentada que o
Cliente esteja utilizando sem aviso prévio por escrito de **45 dias**. Correções
de segurança ficam excetuadas e poderão ser aplicadas de imediato.

**2.4 Ambiente de homologação.** A Lumen disponibilizará um ambiente fora de
produção, sem custo, durante a vigência. Nenhum nível de serviço se aplica a
esse ambiente.

## 3. Dos valores e do pagamento

**3.1 Valores.** O Cliente pagará uma mensalidade de **R$ 28.000,00** e uma taxa
transacional de **0,6% do Volume Transacionado**. Não há compromisso de volume
mínimo.

**3.2 Faturamento.** A Lumen emitirá a fatura mensalmente, de forma vencida, em
até cinco dias úteis após o encerramento de cada mês civil.

**3.3 Prazo de pagamento.** As faturas vencem em **15 dias** contados da data de
emissão. Os valores em atraso ficam sujeitos a multa de **2%** e juros de mora
de **1% ao mês**, além de correção monetária pelo IGP-M, da data de vencimento
até o efetivo pagamento.

**3.4 Suspensão por inadimplência.** Permanecendo a fatura em aberto por 30 dias
após o vencimento, a Lumen poderá suspender a Plataforma mediante aviso prévio
de dez dias úteis. A suspensão não exonera o Cliente do pagamento.

**3.5 Tributos.** Os valores não incluem ISS nem quaisquer outros tributos
incidentes, que serão suportados pelo Cliente.

**3.6 Reajuste.** Os valores da Cláusula 3.1 serão reajustados anualmente pela
variação do IPCA acumulado nos doze meses anteriores, mediante aviso prévio de
30 dias.

## 4. Do prazo e da rescisão

**4.1 Prazo inicial.** Este Contrato vigorará por **12 meses** contados da Data
de Início (o "Prazo Inicial").

**4.2 Renovação.** Ao término do Prazo Inicial, e ao término de cada período de
renovação, o Contrato será renovado automaticamente por mais **12 meses**, salvo
se uma das Partes notificar a outra nos termos da Cláusula 4.3.

**4.3 Rescisão imotivada.** Qualquer das Partes poderá rescindir este Contrato
ao final do Prazo Inicial, ou de qualquer período de renovação, mediante aviso
prévio por escrito de, no mínimo, **60 (sessenta) dias** da respectiva data.

**4.4 Rescisão por justa causa.** Qualquer das Partes poderá rescindir de
imediato, por escrito, se a outra incorrer em infração contratual relevante não
sanada em 15 dias contados da notificação para saná-la, ou se tiver falência
decretada ou recuperação judicial deferida.

**4.5 Efeitos da rescisão.** Com a rescisão, cessa o direito de uso da
Plataforma e a Lumen faturará os valores vencidos e não pagos. Permanecem em
vigor as Cláusulas 7, 8, 10, 11, 12 e 13.

## 5. Das obrigações do Cliente

**5.1** O Cliente manterá suas credenciais de API em sigilo, promoverá sua
rotação ao menos a cada 12 meses e comunicará a Lumen em até 24 horas da ciência
de que uma credencial possa ter sido exposta.

**5.2** O Cliente não utilizará a Plataforma para processar pagamentos de
atividades constantes da lista de categorias vedadas publicada pela Lumen, e
comunicará a Lumen antes de iniciar nova linha de negócio que possa nela
enquadrar-se.

**5.3** O Cliente responde pela exatidão dos dados de liquidação que informar. A
Lumen não responde por pagamento corretamente enviado a conta indicada de forma
equivocada pelo Cliente.

## 6. Dos níveis de serviço

**6.1 Compromisso de disponibilidade.** A Lumen manterá os endpoints de captura
e autorização de pagamento disponíveis **99,5%** do tempo em cada mês civil,
apurados como a proporção de intervalos de um minuto em que uma requisição bem
formada obteve resposta distinta de `5xx`.

**6.2 Créditos de serviço.** Caso a disponibilidade no mês fique abaixo do
compromisso da Cláusula 6.1, o Cliente poderá pleitear crédito de **5% da
mensalidade por hora completa de indisponibilidade**, limitado a **25% da
mensalidade do mês**. O pleito deverá ser apresentado em até 30 dias do
encerramento do mês a que se refere. Os créditos de serviço constituem o único
remédio do Cliente pelo descumprimento da Cláusula 6.1.

**6.3 Prazos de atendimento.** A Lumen acusará o recebimento do chamado em até:

- **2 horas** para incidente P1, assim entendida a indisponibilidade da captura
  de pagamentos para todos os usuários do Cliente;
- **8 horas úteis** para incidente P2, assim entendida a degradação de
  funcionalidade documentada sem solução de contorno;
- **3 dias úteis** para solicitação P3, assim entendido qualquer outro caso.

O aceite do chamado não equivale à sua solução, e este Contrato não estabelece
prazo de solução.

**6.4 Exclusões.** A Cláusula 6.1 não se aplica à indisponibilidade decorrente
dos sistemas do próprio Cliente, de limite de requisições previsto na Cláusula
2.2, de manutenção comunicada com 48 horas de antecedência, ou de evento alheio
ao controle razoável da Lumen.

**6.5 Janela de manutenção.** A Lumen poderá realizar manutenção programada
entre 01h00 e 04h00, horário de Brasília, aos domingos. O tempo compreendido em
janela comunicada fica excluído da apuração da Cláusula 6.1.

## 7. Da proteção de dados

**7.1 Papéis.** Quanto aos Dados do Cliente, o Cliente é o controlador e a Lumen
é a operadora, nos termos da Lei nº 13.709/2018. A Lumen tratará os Dados do
Cliente apenas conforme instruções documentadas do Cliente, entre as quais se
inclui este Contrato.

**7.2 Segurança.** A Lumen manterá programa de segurança da informação
certificado anualmente em SOC 2 Type II e apresentará o relatório mais recente
quando solicitado, no máximo uma vez por ano.

**7.3 Comunicação de incidentes.** A Lumen comunicará o Cliente em até **48
horas** da ciência de incidente de segurança que afete os Dados do Cliente,
informando o que souber naquele momento, sem aguardar a conclusão da apuração.

**7.4 Exportação e eliminação.** Por **90 dias** após a rescisão, o Cliente
poderá exportar os Dados do Cliente pela Plataforma. A Lumen eliminará os Dados
do Cliente **em até 90 dias** do término desse período de exportação, salvo
quanto aos registros cuja guarda seja exigida por lei, hipótese em que reterá
apenas tais registros e somente pelo prazo exigido.

**7.5 Suboperadores.** A Lumen poderá contratar suboperadores e publicará a
respectiva relação. O Cliente poderá se opor a novo suboperador em até 14 dias
da publicação, caso em que as Partes negociarão de boa-fé, podendo o Cliente
rescindir nos termos da Cláusula 4.4 se não houver acomodação.

## 8. Da confidencialidade

**8.1** Cada Parte manterá em sigilo as informações confidenciais da outra,
utilizando-as apenas para os fins deste Contrato e revelando-as somente a
empregados e assessores que delas necessitem e estejam sujeitos a dever de
sigilo.

**8.2** O dever não alcança informação que se torne pública sem culpa da Parte
receptora, que já fosse por ela conhecida sem dever de sigilo, ou que venha a
ser desenvolvida de forma independente, sem recurso às informações da Parte
reveladora.

**8.3** A Parte obrigada por lei ou por autoridade a revelar poderá fazê-lo,
comunicando a outra com a antecedência que a lei permitir.

## 9. Das garantias

**9.1** Cada Parte declara ter poderes para celebrar este Contrato.

**9.2** A Lumen garante que a Plataforma funcionará, em seus aspectos
relevantes, conforme descrito na documentação publicada.

**9.3** Ressalvado o previsto neste Contrato, a Plataforma é fornecida no estado
em que se encontra, sem qualquer outra garantia, expressa ou implícita.

## 10. Da limitação de responsabilidade

**10.1** Nenhuma das Partes exclui responsabilidade por dolo, nem por aquilo que
a lei não permita excluir.

**10.2** Nenhuma das Partes responde por lucros cessantes, perda de negócios ou
danos indiretos.

**10.3** Ressalvado o item 10.1, a responsabilidade total de cada Parte sob este
Contrato fica limitada aos **valores pagos ou devidos pelo Cliente nos 6 meses
anteriores** ao fato gerador da pretensão.

**10.4** O limite do item 10.3 não se aplica à obrigação de pagamento do Cliente
nem à violação da Cláusula 8 por qualquer das Partes.

## 11. Da indenização

**11.1** A Lumen defenderá o Cliente em demanda que alegue violação de direitos
de propriedade intelectual de terceiro pela Plataforma, arcando com as
condenações finais, desde que comunicada tempestivamente e que lhe seja confiada
a condução da defesa.

**11.2** O Cliente defenderá a Lumen em demanda decorrente dos Dados do Cliente
ou do uso da Plataforma em violação à Cláusula 5, nos mesmos termos.

## 12. Da não contratação de pessoal

Durante a vigência e por **24 meses** após o seu término, nenhuma das Partes
aliciará para contratação empregado da outra que tenha participado da execução
deste Contrato. Anúncio geral não dirigido a essa pessoa não configura
aliciamento.

## 13. Disposições gerais

**13.1 Cessão.** Nenhuma das Partes poderá ceder este Contrato sem anuência
escrita da outra, exceto a sucessor da totalidade ou de parte substancial de
seus negócios.

**13.2 Notificações.** As notificações serão feitas por escrito aos endereços
acima, ou a outro que a Parte venha a indicar por escrito. A notificação por
correio eletrônico só produz efeitos se o destinatário acusar o recebimento.

**13.3 Integralidade.** Este Contrato e seus Anexos representam o inteiro teor
do ajuste entre as Partes sobre a matéria, substituindo tratativas anteriores,
verbais ou escritas.

**13.4 Alterações.** Qualquer alteração somente produz efeitos se feita por
escrito e assinada por ambas as Partes.

**13.5 Lei aplicável.** Este Contrato é regido pelas leis da República
Federativa do Brasil.

**13.6 Foro.** As Partes elegem o foro da Comarca de São Paulo, Estado de São
Paulo, com renúncia a qualquer outro, por mais privilegiado que seja.

## Anexo I: Valores

Mensalidade: R$ 28.000,00, faturada mensalmente de forma vencida.

Taxa transacional: 0,6% do Volume Transacionado, faturada junto com a
mensalidade.

Tratamento de chargeback: R$ 60,00 por chargeback recebido, qualquer que seja o
desfecho.

Ambientes de homologação adicionais ao primeiro: R$ 1.500,00 por mês cada.

## Anexo II: Contatos de suporte

Os incidentes P1 são abertos por telefone, no número que a Lumen publicar no
painel, e recebem aceite de pessoa técnica identificada pelo nome.

As solicitações P2 e P3 são abertas pelo portal de suporte. O Cliente poderá
indicar até cinco pessoas autorizadas a abri-las.

A Lumen revisará trimestralmente com o Cliente o histórico de atendimento, e
essa revisão é o momento em que qualquer das Partes levanta preocupação quanto à
Cláusula 6, em vez de aguardar a data de renovação.

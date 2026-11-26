DESIGN.md — Identidade visual do formulário
1. Conceito
Criar uma experiência de autenticação moderna, leve e memorável, construída a partir da identidade visual da marca. A interface combina azul e branco, formas abstratas inspiradas nos recortes orgânicos da logo, transparências semelhantes a vidro, iluminação suave e profundidade sutil.

A marca não deve aparecer apenas como um logotipo colocado no formulário: seus elementos geométricos devem inspirar a composição do fundo, os recortes decorativos e a linguagem visual da tela.

Palavras-chave: abstrato, fluido, tecnológico, elegante, acolhedor, minimalista e interativo.
2. Paleta e tokens visuais
Usar a cor oficial da logo como referência principal. Abaixo estão tokens iniciais que podem ser ajustados para corresponder exatamente ao arquivo de marca:
Token	Valor sugerido	Uso
--brand-blue	#1F4F9A	Azul principal da marca e títulos
--brand-deep	#082D68	Contraste, formas de fundo e texto forte
--brand-cobalt	#086BDA	Ações, foco e destaques
--blue-light	#8CC8FF	Brilhos e contornos luminosos
--surface	rgba(255,255,255,.42)	Cartão translúcido
--surface-strong	rgba(255,255,255,.66)	Campos e superfícies de maior contraste
--text-primary	#103B78	Títulos e conteúdo principal
--text-secondary	#52739F	Descrições e textos auxiliares
--white	#FFFFFF	Texto sobre azul e detalhes


Manter a interface predominantemente azul e branca. Evitar introduzir cores decorativas que concorram com a identidade da marca.
3. Fundo e linguagem gráfica
- Usar o arquivo background-login.png como imagem de fundo de referência para a tela de login.
- O fundo é abstrato, em azul e branco, com área central clara e relativamente livre para acomodar o cartão.
- As formas laterais remetem aos recortes orgânicos e pétalas da logo, sem reproduzir literalmente o símbolo em escala gigante.
- Adicionar curvas finas, linhas de contorno, gradientes suaves e pequenos pontos luminosos.
- Aplicar uma textura granulada muito discreta, se necessário, para evitar aparência excessivamente plástica.
- O fundo deve cobrir a viewport (cover) e permanecer sem repetição.
- Em telas pequenas, priorizar legibilidade: reposicionar ou simplificar os elementos decorativos e manter o cartão em primeiro plano.
4. Cartão de autenticação
- Cartão centralizado, com largura máxima aproximada de 440px a 480px.
- Fundo branco translúcido, com efeito de vidro fosco (backdrop-filter: blur(...)).
- Bordas arredondadas generosas, entre 28px e 36px.
- Borda branca fina com transparência e sombra azul difusa.
- Espaçamento interno confortável, com hierarquia clara entre marca, título, descrição, campos e ações.
- O cartão deve manter contraste suficiente em diferentes monitores; não depender apenas do blur para separar o conteúdo do fundo.
5. Cabeçalho e marca
- Exibir a logo oficial no topo do cartão, centralizada e sem distorções.
- Preservar proporção, área de respiro e cores originais do arquivo da marca.
- Abaixo, usar um título curto, por exemplo: “Bem-vindo(a)!”.
- Complementar com uma descrição discreta: “Faça login para continuar.”
- Não redesenhar nem modificar a logo para encaixá-la no layout.
6. Campos e controles
- Campos em formato de cápsula ou retângulo com cantos bem arredondados.
- Fundo translúcido branco/azulado, borda branca ou azul muito clara e sombra interna quase imperceptível.
- Ícones lineares em azul profundo, alinhados à esquerda.
- Placeholder em azul-acinzentado com contraste adequado.
- Campo de senha com controle de mostrar/ocultar senha.
- Altura recomendada: 56px a 64px em desktop; nunca inferior a 48px em mobile.
- Rótulos acessíveis associados aos respectivos campos; não depender exclusivamente dos placeholders.
Estados de interação
- Padrão: superfície translúcida e borda suave.
- Hover: aumentar levemente a definição da borda e a sombra.
- Focus: contorno azul vivo, halo externo sutil e indicador de foco visível.
- Erro: mensagem textual próxima ao campo e borda de erro claramente identificável.
- Sucesso: feedback discreto, sem animações excessivas.
- Desabilitado/carregando: reduzir intensidade visual e impedir ações duplicadas.
7. Botão principal
- Botão de largura total, com formato de cápsula.
- Gradiente azul profundo para azul vivo, inspirado na identidade da marca.
- Texto branco, peso semibold e ícone de entrada opcional.
- Sombra azul suave para sugerir profundidade.
- Hover: brilho e elevação mínimos.
- Active: leve redução de escala ou profundidade.
- Loading: indicador de carregamento e texto apropriado; bloquear novos envios enquanto a requisição estiver em andamento.
8. Login social e links auxiliares
- Se o projeto já oferecer autenticação social, exibir os provedores disponíveis em botões circulares ou compactos, com ícones oficiais.
- Separar a área social por uma linha fina e um texto auxiliar, como “Ou continue com”.
- Incluir links como recuperação de senha e cadastro somente se essas rotas/funcionalidades existirem.
- Não apresentar provedores fictícios ou controles sem ação funcional.
9. Movimento e microinterações
As animações devem ser sutis e funcionais:
- Entrada do cartão com fade-in e pequeno deslocamento vertical.
- Formas abstratas do fundo podem ter movimento lento de flutuação/parallax, sem competir com o formulário.
- Pequenos pontos luminosos podem variar suavemente de opacidade.
- Botões e campos devem responder ao hover, foco e clique com transições curtas.
- Respeitar prefers-reduced-motion e desativar movimentos decorativos quando solicitado pelo sistema.
- Evitar animações contínuas pesadas que prejudiquem desempenho ou bateria em dispositivos móveis.
10. Responsividade
Desktop
- Ocupar toda a viewport, com o cartão centralizado horizontal e verticalmente.
- Manter o fundo abstrato visível nas laterais e uma área central limpa.
- Limitar a largura do cartão para preservar proporção e leitura.
- Em alturas menores, permitir rolagem vertical em vez de cortar o conteúdo.
Mobile
- Usar cartão com largura calc(100% - 32px) e largura máxima adequada.
- Reduzir margens e espaçamentos sem comprimir os controles.
- Simplificar ou deslocar as formas do fundo para evitar competição visual.
- Manter todos os campos em uma única coluna.
- Garantir que o conteúdo possa rolar quando a altura disponível for pequena ou o teclado virtual estiver aberto.
- Evitar rolagem horizontal e respeitar as áreas seguras do dispositivo.
11. Acessibilidade e qualidade
- Garantir contraste adequado entre texto, campos e fundo.
- Usar elementos HTML semânticos, labels explícitos e navegação completa por teclado.
- Exibir foco visível em todos os controles interativos.
- Fornecer mensagens de erro compreensíveis e associadas aos campos.
- Usar alvos de toque confortáveis.
- Não usar somente cor para comunicar erros ou estados.
- Otimizar a imagem de fundo para carregamento rápido e considerar uma cor de fallback caso a imagem não carregue.
12. Diretrizes de implementação
1. Antes de alterar o código, identificar o framework, a estrutura da tela e os componentes de autenticação existentes.
2. Preservar integralmente a lógica de autenticação, validações, rotas, integrações e tratamento de erros.
3. Reaproveitar os componentes existentes sempre que possível.
4. Centralizar cores, sombras, raios e espaçamentos em variáveis/tokens, evitando valores duplicados.
5. Implementar o layout com CSS responsivo e sem dimensões rígidas que quebrem em telas menores.
6. Tratar a imagem background-login.png como recurso visual de fundo, não como uma imagem contendo a interface pronta.
7. Construir cartão, campos, botão, textos e ícones como elementos reais da aplicação, acessíveis e interativos.
8. Testar em larguras mobile, tablet e desktop, além de validar estados de foco, erro e carregamento.
13. Resultado esperado
Uma tela de login que pareça pertencer naturalmente à marca: azul e branca, abstrata sem ser confusa, tecnológica sem ser fria e sofisticada sem excesso de efeitos. O fundo cria personalidade; o cartão mantém foco e clareza; as interações dão vida à experiência sem comprometer desempenho ou acessibilidade.
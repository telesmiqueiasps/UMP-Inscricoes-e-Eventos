# Diretrizes de Design & UI/UX — UMP Eventos & Acamp Sinodal

Este repositório segue padrões de design de alta fidelidade visual para afastar qualquer aspecto genérico ("cara de IA") e entregar interfaces profissionais, contemporâneas e imersivas.

## 1. Princípios de Estética Visual (Anti-"Cara de IA")
- **Evitar o modo padrão genérico**: Não crie cartões brancos/cinzas com cantos puramente arredondados e sombras simples, botões azuis genéricos ou tabelas sem personalidade.
- **Identidade Temática & Textura**:
  - Incorpore detalhes visuais tangíveis: texturas sutis (malha esportiva/mesh, gradientes radiais profundos, micro-ruídos ou padrões de linhas de velocidade).
  - Cantoneiras esportivas/táticas HUD (`.card-bracket`), chanfros e detalhes de borda translúcida (`border: 1px solid rgba(255,255,255,0.12)`).
  - Pinceladas e adornos orgânicos que conversem com a temática do evento ("Um só Corpo — Uma só Igreja").
- **Profundidade e Camadas**:
  - Use planos sobrepostos (backdrops com `backdrop-filter: blur(20px)`).
  - Sombras multicamada em vez de sombras pretas duras.
  - Placas de reflexo luminoso neon no rodapé de números e placares (`score-glow-plate`).

## 2. Paleta de Cores e Contraste
- **Fundo Primário**: Tons profundos e ricos em vez de cinza neutro (ex: Verde-petróleo profundo `#001E21`, `#00363A`, `#004C50`).
- **Cores de Ação e Destaque**:
  - Laranja vibrante: `#FF7900`
  - Verde Esmeralda: `#00B894`
  - Ouro de Vitória: `#FFB703` / `#FFD166`
- **Texto e Leitura**:
  - Títulos principais: Branco luminoso `#FFFFFF` com leve text-shadow ou gradiente metálico sutil.
  - Rótulos e metadados: `#94A3B8` ou `#CBD5E1` com tracking expandido (`letter-spacing: 0.1em`).

## 3. Tipografia Editorial & Esportiva
- Utilizar fontes modernas do Google Fonts já importadas no projeto:
  - **Títulos de Impacto e Placar**: `'Teko'`, `'Bebas Neue'`, `'Outfit'`.
  - **Interface, Dados e Leitura**: `'Plus Jakarta Sans'`, `'Inter'`.
  - **Caligrafia Decorativa**: `'Caveat'`.
- Números com fonte tabular (`font-variant-numeric: tabular-nums`) para contadores dinâmicos não oscilarem a largura.

## 4. Responsividade Mobile Estrita (Zero Overflow)
- **100% de Largura Segura**: Em qualquer tela ou componente mobile, manter `width: 100%; max-width: 100vw; box-sizing: border-box;`.
- **Prevenção de Rolagem Lateral**:
  - Elementos absolutos/fixos de fundo devem estar dentro de contêineres com `overflow: hidden; pointer-events: none;`.
  - Grids de cards no mobile devem usar `minmax(0, 1fr)` para evitar que textos longos forcem colunas para fora do visor.
  - Títulos e tags com `text-overflow: ellipsis` ou `word-break: break-word`.
- **Alvos de Toque Confortáveis**: Botões e ícones interativos devem ter no mínimo 36x36px a 44x44px no mobile.

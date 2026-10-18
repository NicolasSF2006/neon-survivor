# Preparação da publicação

Repositório público criado com autorização: [NicolasSF2006/neon-survivor](https://github.com/NicolasSF2006/neon-survivor). A conta autenticada foi confirmada como `NicolasSF2006`, e o nome estava livre na listagem autenticada de repositórios próprios, incluindo privados. O deploy na Vercel continua sem autorização e não foi realizado; ainda não há URL pública do jogo para registrar.

## Repositório proposto

- Nome: `neon-survivor`.
- Conta de destino confirmada: `NicolasSF2006`.
- Descrição: “Jogo arcade 2D desenvolvido com React, TypeScript e PixiJS, com pixel art, combate em 360°, ondas de meteoros e controles responsivos.”
- Visibilidade do repositório: pública, autorizada explicitamente.
- Branch principal: `main`.
- Licença existente: MIT; preservada.

Na auditoria inicial não existiam `.git`, commits ou remotes nesta pasta. Foi preparado um commit inicial na branch `main`. Antes do primeiro envio, o e-mail do autor e do committer foi substituído pelo `noreply` baseado no ID da conta GitHub, preservando o nome Nicolas Frazão. O e-mail também foi configurado localmente neste repositório, sem alterar a configuração global do Git.

## Arquivos e credenciais

O `.gitignore` exclui dependências, `dist`, `.env` e variantes locais, dados locais da Vercel, caches, logs, temporários, relatórios de teste e arquivos de chaves privadas. Um eventual `.env.example` é permitido apenas como modelo sem segredos. Não há necessidade de variáveis de ambiente para o jogo atual.

Revise o conteúdo preparado com `git diff --cached --stat` e `git diff --cached` antes do commit. Nunca adicione tokens, senhas ou arquivos pessoais. A exclusão no `.gitignore` não remove segredos que já tenham sido commitados; se isso acontecer, interrompa a publicação e trate o incidente antes de prosseguir.

## Autenticação no GitHub

O GitHub CLI não estava instalado na auditoria inicial. Depois, a instalação e a autenticação na conta correta foram confirmadas. Para configurar outro ambiente Windows, instale pelo método oficial:

```powershell
winget install --id GitHub.cli --exact
```

Abra um novo terminal e autentique pelo navegador:

```powershell
gh auth login --hostname github.com --git-protocol https --web
gh auth status
gh api user --jq .login
```

Não envie senhas, tokens ou códigos de autenticação pelo chat. Confirme que o login retornado é a conta desejada, ou confirme a organização de destino e suas permissões.

Depois da autorização, consulte se `CONTA/neon-survivor` já existe. Se existir, preserve o repositório e esclareça o destino; não crie duplicatas, não substitua seu histórico e nunca use force push. Uma falha de rede ou de permissão não equivale a repositório inexistente. Somente após essa verificação crie o repositório público e envie a branch `main` validada.

Referências: [instalação oficial do GitHub CLI](https://github.com/cli/cli#installation) e [autenticação pelo navegador](https://cli.github.com/manual/gh_auth_login).

## Validação local

Com Node.js 24.x:

```powershell
npm install
npm test
npx tsc --noEmit
npm run build
npm run preview -- --host 127.0.0.1
```

O `package-lock.json` existente deve ser mantido. Para uma instalação estritamente baseada no lockfile, use `npm ci`. Não publique `node_modules` ou `dist` no repositório de código.

Verifique na versão de produção: menu inicial, partida, WASD/setas, mira de 360°, clique/Espaço, meteoros, colisões, ondas, pontuação, pausa por botão/P/Esc, Game Over e reinício. Confira também pixel art, propulsor em repouso/movimento, paralaxe, dois joysticks, retrato/paisagem, resize e console.

Os testes de navegador desta preparação usam automação e inspeção visual em Chrome, com celular emulado. Os scripts e as capturas temporárias ficam fora do repositório; não há uma suíte Playwright instalada como dependência do projeto. Isso não substitui testes em dispositivos físicos.

### Resultado da preparação local

- `npm test`: 47 testes aprovados.
- `npx tsc --noEmit`: aprovado.
- `npm run build`: aprovado.
- `npm audit`: zero vulnerabilidades conhecidas na consulta realizada durante a preparação; isso não é garantia de ausência de vulnerabilidades futuras.
- Varredura dos arquivos candidatos ao commit: nenhum token, senha, chave privada, e-mail ou caminho pessoal identificado. Dependências, build, caches e temporários ficam fora do commit.
- Produção local no Chrome: 1920×1080, 1366×768, 390×844 e 844×390, incluindo movimento, mira/disparos, colisões, score, ondas, pausa, Game Over, reinício, joysticks, resize e orientação. Sem erros ou avisos no console.
- Propulsor: repouso, movimento, retorno e alinhamento com rotação/tiros; resposta equivalente em simulações de 30, 60 e 144 FPS.
- Paralaxe: camadas e perfil compacto verificados; conjunto fixo de gráficos e heap estável em 40 minutos simulados, com liberação dos recursos em cinco ciclos de montagem/desmontagem por perfil testado.

O pacote de produção foi exercitado sem instrumentação no fluxo básico. Casos determinísticos usaram sondas temporárias adicionadas somente à resposta JavaScript no navegador de teste, sem alterar os arquivos de `dist` nem incluir sondas no código do projeto. Não foram necessárias alterações em mecânicas ou no código do jogo nesta preparação.

A consulta pública inicial retornou HTTP 404. Antes da criação, a consulta autenticada e a listagem dos repositórios próprios, públicos e privados, confirmaram a ausência de `NicolasSF2006/neon-survivor`. O repositório foi então criado publicamente com autorização, sem substituir um remoto existente.

## Integração GitHub + Vercel

O Vercel CLI não é necessário para o fluxo por integração Git. Faça login na sua conta Vercel no navegador e conecte a conta GitHub correta. Confirme também o time/projeto de destino. Nenhuma credencial deve entrar no repositório.

**A importação pode iniciar o deploy imediatamente: só prossiga com a importação e o botão Deploy depois da autorização explícita para disponibilizar o jogo publicamente.**

Configuração registrada em `vercel.json`:

| Campo | Valor |
| --- | --- |
| Framework | Vite |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production Branch | `main` (configurar no painel) |
| Node.js | 24.x (configurar no painel) |
| Variáveis de ambiente | Nenhuma exigida pelo jogo |

Não há rotas por URL no projeto, portanto não é necessário configurar um fallback de SPA. O `base: './'` já existente foi mantido. Quando a integração estiver ativa, commits na branch de produção dispararão novos deploys; considere isso ao autorizar futuros pushes.

Referências: [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite) e [integração oficial com GitHub](https://vercel.com/docs/git/vercel-for-github).

## Validação pública pendente

Após publicação autorizada:

1. Obtenha a URL real e confirme qual commit da branch `main` originou o deploy.
2. Abra a URL e confira HTTP, carregamento de assets, canvas, visual e console.
3. Jogue e valide movimento, mira, tiros, colisões, pontuação, pausa, Game Over e reinício.
4. Confira desktop, celular emulado, orientação e redimensionamento.
5. Compare a versão/commit público com a versão local validada.
6. Atualize o README com a URL real e registre os resultados. O envio dessa atualização também pode gerar novo deploy.

Enquanto não houver URL e validação, a publicação deve ser descrita como pendente. Informe separadamente qualquer verificação que não tenha sido possível.

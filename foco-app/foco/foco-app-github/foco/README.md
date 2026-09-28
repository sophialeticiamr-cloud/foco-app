# Foco — PWA de estudos, produtividade e casal

Este projeto é uma versão completa do aplicativo: cronômetro livre, descanso automático, tarefas, placar de casal, sorteador de encontros e botão de resgate.

## Estrutura

```text
foco/
├─ index.html
├─ style.css
├─ app.js
├─ firebase-config.js
├─ manifest.webmanifest
├─ sw.js
├─ icons/
│  └─ icon.svg
└─ README.md
```

## 1. Testar no computador

Não abra `index.html` com duplo clique para testar o PWA. O Service Worker precisa de HTTP/HTTPS.

A forma mais simples:

### Opção A — VS Code

Instale a extensão **Live Server** no VS Code.

Depois:
1. Abra a pasta `foco`.
2. Clique com o botão direito em `index.html`.
3. Escolha `Open with Live Server`.
4. O navegador abrirá algo parecido com `http://127.0.0.1:5500`.

### Opção B — Python

Se você já tiver Python instalado, abra o terminal dentro da pasta e execute:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

## 2. Publicar pelo GitHub Pages

1. Crie um repositório no GitHub, por exemplo `foco-app`.
2. Envie todos os arquivos desta pasta.
3. Vá em **Settings > Pages**.
4. Em **Build and deployment**, escolha:
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/ (root)`
5. Salve e aguarde a publicação.

O endereço será semelhante a:

```text
https://SEU-USUARIO.github.io/foco-app/
```

## 3. Publicar pela Vercel

Também funciona como site estático:

1. Crie um repositório no GitHub.
2. Entre na Vercel.
3. Importe o repositório.
4. Framework Preset: `Other`.
5. Build Command: deixe vazio.
6. Output Directory: `.`
7. Deploy.

## 4. Instalar como PWA

Depois de publicar em HTTPS, abra o endereço no Chrome/Edge.

Procure o botão de instalação na barra de endereço. O aplicativo será aberto em uma janela independente no modo `standalone`.

Importante: o PWA não consegue obrigar o sistema operacional a manter a janela sempre no canto ou sempre acima de outros programas. Você pode redimensionar e posicionar a janela manualmente. A posição persistida depende do navegador/sistema operacional.

## 5. O que já funciona sem banco de dados

O navegador guarda localmente:
- sessões de estudo;
- tempo de hoje e da semana;
- matéria e motivo da sessão;
- tarefas do dia;
- progresso das tarefas;
- sorteador de encontros.

Isso é feito com `localStorage`. Portanto, os dados pessoais ficam naquele navegador/dispositivo e não aparecem automaticamente em outro computador.

## 6. Como ativar o placar compartilhado

O módulo de casal precisa de um backend porque dois dispositivos diferentes não compartilham `localStorage`.

Este projeto usa Firebase Realtime Database + autenticação anônima.

### Criar o projeto

No Firebase Console:

1. Crie um projeto.
2. Adicione um aplicativo Web.
3. Copie o objeto `firebaseConfig`.
4. Abra `firebase-config.js`.
5. Cole os valores no objeto.
6. Altere:

```js
export const FIREBASE_ENABLED = true;
```

### Ativar login anônimo

Firebase Console:
`Authentication > Sign-in method > Anonymous > Enable`

O aplicativo usa autenticação anônima porque não é necessário criar uma conta tradicional para o casal.

### Criar o Realtime Database

Firebase Console:
`Build > Realtime Database > Create database`

Para o primeiro teste, escolha uma região próxima de vocês.

Depois, configure regras. Para um protótipo privado em que o código da sala funciona como segredo compartilhado, você pode começar com:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

Essas regras são simples, mas não são um modelo de segurança forte: qualquer usuário autenticado que conheça um código de sala pode acessar aquela sala. Para uma versão pública, o ideal é evoluir para autorização por membros da sala e regras mais restritivas.

## 7. Como o "ao vivo" funciona

Quando você começa a estudar, o navegador escreve no Firebase:

```text
rooms/
  CODIGO_DO_CASAL/
    presence/
      usuario/
        online: true
        studying: true
```

Quando você pausa/encerra, `studying` vira `false`.

O `onDisconnect()` também registra a desconexão quando o navegador perde a conexão.

As sessões encerradas são gravadas em:

```text
rooms/
  CODIGO_DO_CASAL/
    sessions/
      ...
```

O placar semanal soma as sessões cuja data pertence à semana atual.

## 8. Limitações importantes

1. O Firebase não é necessário para usar o cronômetro ou tarefas.
2. O histórico local não é sincronizado com o Firebase retroativamente; apenas novas sessões encerradas enquanto a sala está conectada são enviadas.
3. A presença "ao vivo" depende de conexão com a internet.
4. O PWA pode funcionar offline para os módulos locais, mas o placar compartilhado obviamente não consegue sincronizar sem internet.
5. Para um aplicativo real publicado para muitas pessoas, o modelo de segurança do Firebase deve ser endurecido.

## 9. Próxima evolução técnica

Depois de testar esta versão, os próximos incrementos naturais são:
- autenticação individual;
- perfil de cada pessoa;
- calendário semanal;
- metas compartilhadas;
- estatísticas por matéria;
- gráficos de consistência;
- histórico de encontros realizados;
- edição do banco de encontros;
- notificações do navegador;
- sincronização de tarefas;
- regras Firebase por usuário/sala;
- backup/exportação dos dados.

# 狐狸之海 RTS MCP 中文接入指南

[游戏官网](https://www.drmaplee.com/sea-of-fox/#mcp) · [进入 RTS 游戏](https://www.drmaplee.com/sea-of-fox-game/?mode=rts) · [DeepWiki](https://deepwiki.com/DRMAPLEE/sea-of-fox-rts-mcp) · [npm](https://www.npmjs.com/package/sea-of-fox-rts-mcp)

把 Sea of Fox RTS MCP 接入你自己的 Agent，它就可以查看战况、发展母港、训练部队和指挥舰队。玩家和 Agent 共用同一个 RTS 席位。你上线时，服务器立即把发令权交给你。你离开海域后，只要 Agent 和 MCP 客户端仍在运行，Agent 就能沿用相同的阵营、资源、单位和订单接着玩。

## 配对与安装

1. 安装 Node.js 22.23.4 或更高版本，准备支持本地 `stdio` MCP 服务的客户端。
2. 进入在线 RTS 海域，打开 **设置 → RTS MCP → 生成凭证**，复制游戏中显示的服务器地址和凭证。PVE 或 PVP 对局请从游戏内开始比赛。
3. 在 MCP 客户端添加下面的配置。官服地址是 `https://www.drmaplee.com`。使用其他服务器时，填游戏中显示的服务器地址。把真实凭证保存在客户端的私有环境配置里。

```json
{
  "mcpServers": {
    "sea-of-fox-rts": {
      "command": "npx",
      "args": ["-y", "sea-of-fox-rts-mcp@0.2.0"],
      "env": {
        "SEA_OF_FOX_RTS_URL": "https://www.drmaplee.com",
        "SEA_OF_FOX_RTS_TOKEN": "在这里填写你的凭证"
      }
    }
  }
}
```

连接后，先在游戏内让 Agent 查看当前海域。然后退出海域，让仍在运行的 Agent 接手。重新进入同一海域即可接回指挥权。要结束授权，可在配对菜单选择 **撤销凭证**。

## 给 Agent 一个目标

> 查看我的母港和资源。等我离开海域后，先发展木材，再训练一支登陆队和一艘运兵舰。确认部队登船后再出航，靠岸后登陆并尝试占领最近的目标岛。

| 工具 | 用途 |
| --- | --- |
| `rts_catalog` | 查看当前阵营的规则、资源产量、价格与兵种 |
| `rts_observe` | 查看控制权、目标、资源和己方视野内的战况 |
| `rts_build_sites` | 查询工人可用的建筑或码头选址 |
| `rts_order` | 批量下达建造、训练、移动、登船、航行、登陆、进攻等指令，查看逐条回执 |
| `rts_wait` | 等待控制权变化、建筑完工、航行结果或其他可观察状态 |
| `rts_messages` | 查看本海域广播、和本阵营有关的私信，并获取可发信的阵营 ID |
| `rts_send_message` | 在 Agent 掌握指挥权时发送广播或阵营私信 |

## 阵营通信

使用支持阵营通信的 RTS 服务器。让两个阵营的 Agent 在同一海域运行，行动之间用 `rts_messages` 检查来信。保存返回的 `nextCursor`，下一次传入 `after` 读取新消息。发信时把目标阵营 ID 填入 `toFaction`，传入 `null` 可向整个海域广播。玩家在线时可以从游戏内的 **阵营通信** 发言，Agent 此时仍可读取消息。

例如，给 Agent 一个目标：「尝试说服红海盗停火，让商船安全经过中岛。继续观察对方舰队，再决定是否派护航。」从官网的 **Agent 战况** 可以同时看见本席位有权查看的对话和后续战场行动。

出海前确认陆军已经登船。抵达后确认部队已登陆，再下达岛上指令。收到订单回执后，用 `rts_wait` 或 `rts_observe` 查看实际进展。对局作战和后续发展由你给 Agent 的目标驱动。

**泊位满时可游泳登船。** 让友方舰船在附近可航水域停稳，再对领主或部队下达 `embark`，指定该船的 `shipId` 并启用 `approach: true`。队伍可以游向船舷并上浮登船。船上仍须留有足够座位。用 `rts_wait` 等每个单位进入 `embarked` 状态后再起航。

## 常见问题

- **`HUMAN_IN_CONTROL`** 表示你仍在线。Agent 可以查看战况，发令需要等你离开海域。
- **HTTP 401** 通常表示凭证失效、撤销或已被更换。重新生成凭证，并更新 `SEA_OF_FOX_RTS_TOKEN`。
- **HTTP 404** 时先核对 `SEA_OF_FOX_RTS_URL`。它应是游戏显示的服务器地址。若自建服务器仍返回 404，请确认该服务器已部署 MCP 接口。
- **关掉网页后怎样继续**。保持 MCP 客户端和 Agent 任务运行。MCP 凭证只授权当前玩家所在的海域。

# 素材與授權（CREDITS）

這個網站公開在 GitHub Pages，所以放進 repo 的每一個素材都要能公開散布。
規則：**只用自製、CC0、或授權寫明可以商用與再散布的素材**；遊戲官方美術、APK 解出來的檔案、拿官方圖叫 AI 改畫的圖都不放進來。
新增素材時，在下面「已使用」表格補一列：檔案位置、作者、來源網址、授權、下載日期。

## 已使用

| 項目 | 檔案 | 作者／來源 | 授權 |
| --- | --- | --- | --- |
| Phaser 4.2.1（網頁遊戲引擎） | `vendor/phaser/phaser-4.2.1.min.js` | Phaser Studio Inc.／npm 套件 `phaser@4.2.1`（https://phaser.io） | MIT，全文見 `vendor/phaser/LICENSE.md` |
| 地圖地塊、山、森林、軍營、橋 | `slg/iso.js` | 本專案自繪（程式畫的 SVG） | 本專案 |
| Q版武將、家紋 | `slg/chibi.js` | 本專案自繪（程式畫的 SVG，家紋為簡化重繪） | 本專案 |
| 紅葉、火花、刀光、雨、煙、雲影 | `slg/fx.js`、`slg/board-phaser.js`、`proto/phaser/main.js` | 本專案自繪（Canvas／Phaser Graphics 產生） | 本專案 |
| 和風音樂與音效 | `slg/audio.js` | 本專案原創（WebAudio 即時合成，五聲音階自己寫的旋律） | 本專案 |
| 字型 Noto Serif TC、Noto Sans TC、DotGothic16、霞鶩文楷 TC | 由 Google Fonts 載入，不放在 repo | Google／Fontworks／LXGW | SIL Open Font License 1.1 |

| Kenney 素材 7 包（粒子、煙、UI 框、打擊／RPG／介面音效） | `assets/kenney/`（逐包明細見 `assets/kenney/CREDITS.md`） | Kenney Vleugels（https://kenney.nl），2026-10-31 Joe 以瀏覽器手動下載 | CC0 1.0；各資料夾附原包 `License.txt`。已放進 repo，尚未接進遊戲 |

## 候選素材（尚未下載）

2026-10-31 更新：Kenney 7 包已由 Joe 手動下載並放進 `assets/kenney/`（見上表）；其餘來源還沒有下載。日後素材由 Joe 在瀏覽器手動下載，不用程式繞過網站的機器人檢查。
授權欄是各站的一般規則；**每一包下載時都要在該頁面再確認一次授權**，確認後才移到上面的「已使用」。

| 來源 | 適合拿來做什麼 | 授權 | 注意 |
| --- | --- | --- | --- |
| Kenney（https://kenney.nl/assets）：Particle Pack、Smoke Particles | 刀光、火花、煙、爆炸粒子 | CC0 | Kenney 沒有和風建築或武士，主要補特效與介面 |
| Kenney：UI Pack、UI Pack (RPG Expansion) | 按鈕、面板、框 | CC0 | 要重新上色成金邊漆器風 |
| Kenney：Impact Sounds、RPG Audio、Interface Sounds | 打擊、腳步、按鈕音效 | CC0 | 刀劍、箭矢可用；太鼓要另找 |
| OpenGameArt（https://opengameart.org，授權篩選 CC0） | 搜 japanese、samurai、torii、taiko、katana | 每件不同，只挑 CC0 | 同一站混有 CC-BY、GPL，逐件看 |
| itch.io（https://itch.io/game-assets，授權篩選 CC0，加 japanese／samurai 標籤） | 和風地塊、建築、圖示 | 只挑標 CC0 的 | 很多寫「free」但不是 CC0，要看頁面授權 |
| freesound（https://freesound.org，授權篩選 Creative Commons 0） | 太鼓、尺八、箏、法螺貝、刀劍、鐵炮 | 只挑 CC0 | 下載要登入，只能手動下載 |
| incompetech（Kevin MacLeod） | 背景音樂 | CC BY 4.0（不是 CC0） | 必須在頁面標示作者與授權 |
| 魔王魂、効果音ラボ、DOVA-SYNDROME（日本免費素材站） | 和風 BGM 與音效，品質高 | 各站自訂規約（不是 CC0） | 可用在作品裡，但多半禁止把原始檔當素材再散布；公開 repo 能直接下載原始檔，放之前要逐站讀規約 |

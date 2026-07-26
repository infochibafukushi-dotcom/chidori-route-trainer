/**
 * 基礎研修問題データ
 * 正解は answerId で管理（選択肢シャッフル後も判定が壊れない）
 * 正本: study-materials-data.js および各資料画像
 */
window.BASIC_TRAINING_QUIZ = [
  {
    id: 'bicycle-distance',
    category: '自転車事故防止',
    question: '自転車を安全に追い抜く際に確保する側方間隔の目安は？',
    choices: [
      { id: 'a', text: '約30cm' },
      { id: 'b', text: '約50cm' },
      { id: 'c', text: '約2m' },
      { id: 'd', text: '間隔は必要ない' }
    ],
    answerId: 'c',
    explanation: '自転車との間に約2mの側方間隔を確保する。',
    sourceMaterialId: 'bicycle-accident-prevention'
  },
  {
    id: 'bicycle-wait-pass',
    category: '自転車事故防止',
    question: '自転車との間に十分な側方間隔を確保できない場合の正しい対応は？',
    choices: [
      { id: 'a', text: '警笛を鳴らして追い抜く' },
      { id: 'b', text: '速度を上げて短時間で追い抜く' },
      { id: 'c', text: '無理に追い抜かず、自転車をやり過ごす' },
      { id: 'd', text: '自転車へ近づいて追い抜く' }
    ],
    answerId: 'c',
    explanation: '約2mの間隔を確保できない場合は、無理に追い抜かず安全な状況を待つ。',
    sourceMaterialId: 'bicycle-accident-prevention'
  },
  {
    id: 'bicycle-crawl-speed',
    category: '自転車事故防止',
    question: '自転車を追い抜くときの速度として正しいものは？',
    choices: [
      { id: 'a', text: '制限速度まで加速する' },
      { id: 'b', text: '通常速度のまま追い抜く' },
      { id: 'c', text: '最徐行する' },
      { id: 'd', text: '自転車と同じ速度で横に並ぶ' }
    ],
    answerId: 'c',
    explanation: '自転車を追い抜く際は最徐行し、急な進路変更にも対応できるようにする。',
    sourceMaterialId: 'bicycle-accident-prevention'
  },
  {
    id: 'bicycle-watch-until-end',
    category: '自転車事故防止',
    question: '自転車を追い抜いた後の確認として正しいものは？',
    choices: [
      { id: 'a', text: '車体前部が通過した時点で確認を終える' },
      { id: 'b', text: '自転車がミラーから消えたらすぐ加速する' },
      { id: 'c', text: '追い抜きが完了するまで自転車を最後まで確認する' },
      { id: 'd', text: '前方だけを確認する' }
    ],
    answerId: 'c',
    explanation: '自転車が車体後部を完全に通過するまで、最後まで安全確認を続ける。',
    sourceMaterialId: 'bicycle-accident-prevention'
  },
  {
    id: 'intersection-right-turn-speed',
    category: '交差点の安全速度',
    question: '右折時の安全速度は何km/h以下ですか？',
    choices: [
      { id: 'a', text: '時速5km以下' },
      { id: 'b', text: '時速10km以下' },
      { id: 'c', text: '時速20km以下' },
      { id: 'd', text: '時速30km以下' }
    ],
    answerId: 'b',
    explanation: '右折時は時速10km以下を基準に安全確認を行う。',
    sourceMaterialId: 'intersection-turning-safety-guide'
  },
  {
    id: 'intersection-left-turn-speed',
    category: '交差点の安全速度',
    question: '左折時の安全速度は何km/h以下ですか？',
    choices: [
      { id: 'a', text: '時速5km以下' },
      { id: 'b', text: '時速10km以下' },
      { id: 'c', text: '時速15km以下' },
      { id: 'd', text: '時速20km以下' }
    ],
    answerId: 'a',
    explanation: '左折時は巻き込み事故防止のため、時速5km以下で進行する。',
    sourceMaterialId: 'intersection-turning-safety-guide'
  },
  {
    id: 'intersection-entry-speed',
    category: '交差点の安全速度',
    question: '交差点へ進入するときの安全速度は何km/h以下ですか？',
    choices: [
      { id: 'a', text: '時速5km以下' },
      { id: 'b', text: '時速10km以下' },
      { id: 'c', text: '時速20km以下' },
      { id: 'd', text: '制限速度までよい' }
    ],
    answerId: 'b',
    explanation: '交差点進入時は時速10km以下とし、左右や歩行者、自転車を確認する。',
    sourceMaterialId: 'intersection-turning-safety-guide'
  },
  {
    id: 'intersection-left-turn-watch',
    category: '交差点の安全速度',
    question: '交差点を左折するとき、特に注意する対象は？',
    choices: [
      { id: 'a', text: '後方の対向車だけ' },
      { id: 'b', text: '右側の建物だけ' },
      { id: 'c', text: '左側を通行する歩行者と自転車' },
      { id: 'd', text: '信号機だけ' }
    ],
    answerId: 'c',
    explanation: '左折時は左側の歩行者、自転車、二輪車の巻き込みに注意する。',
    sourceMaterialId: 'intersection-turning-safety-guide'
  },
  {
    id: 'departure-wait-2sec',
    category: '停留所発進',
    question: '乗客の着座を確認した後、発進までに設ける時間は？',
    choices: [
      { id: 'a', text: 'すぐ発進する' },
      { id: 'b', text: '約1秒' },
      { id: 'c', text: '約2秒' },
      { id: 'd', text: '約10秒' }
    ],
    answerId: 'c',
    explanation: '乗客の着座を確認後、約2秒置いてから発進する。',
    sourceMaterialId: 'passenger-injury-prevention-guide'
  },
  {
    id: 'departure-passenger-moving',
    category: '停留所発進',
    question: '乗客がまだ移動中の場合の正しい対応は？',
    choices: [
      { id: 'a', text: 'ゆっくりであれば発進する' },
      { id: 'b', text: '車内放送だけして発進する' },
      { id: 'c', text: '安全な位置に着座またはつかまったことを確認してから発進する' },
      { id: 'd', text: '後方車が来たらすぐ発進する' }
    ],
    answerId: 'c',
    explanation: '乗客が不安定な状態のまま発進してはいけない。',
    sourceMaterialId: 'bus-stop-departure-safety'
  },
  {
    id: 'departure-precheck',
    category: '停留所発進',
    question: '停留所から発進する直前に必要な確認は？',
    choices: [
      { id: 'a', text: '時刻だけ確認する' },
      { id: 'b', text: '運賃箱だけ確認する' },
      { id: 'c', text: '乗客の安全、車外、ミラーを確認する' },
      { id: 'd', text: '前方信号だけ確認する' }
    ],
    answerId: 'c',
    explanation: '車内の乗客、車外の歩行者や自転車、各ミラーを確認してから発進する。',
    sourceMaterialId: 'bus-stop-departure-safety'
  },
  {
    id: 'door-lever-hands-off',
    category: '扉開閉レバー',
    question: '乗車扱い中、前扉を開けている際の開閉レバー操作として正しいものは？',
    choices: [
      { id: 'a', text: '常に閉方向へ力を入れる' },
      { id: 'b', text: 'レバーを握ったままにする' },
      { id: 'c', text: 'レバーから手を離す' },
      { id: 'd', text: '何度も開閉方向へ動かす' }
    ],
    answerId: 'c',
    explanation: '乗車中の挟み込み事故を防ぐため、指定された場面ではレバーから手を離す。',
    sourceMaterialId: 'door-lever-safety-operation'
  },
  {
    id: 'door-close-precheck',
    category: '扉開閉レバー',
    question: '扉を閉める前に必要な確認は？',
    choices: [
      { id: 'a', text: '時刻だけ確認する' },
      { id: 'b', text: '後続車だけ確認する' },
      { id: 'c', text: '乗降が完了し、扉付近に人や荷物がないことを確認する' },
      { id: 'd', text: '運賃箱だけ確認する' }
    ],
    answerId: 'c',
    explanation: '扉付近の乗客、荷物、衣服などを目視とミラーで確認する。',
    sourceMaterialId: 'door-lever-safety-operation'
  },
  {
    id: 'door-reopen-on-approach',
    category: '扉開閉レバー',
    question: '扉を閉め始めた後に乗客が近づいた場合の対応は？',
    choices: [
      { id: 'a', text: 'そのまま閉める' },
      { id: 'b', text: '乗客に急ぐよう促す' },
      { id: 'c', text: '直ちに安全を確認して再開扉する' },
      { id: 'd', text: '発車して次の停留所で対応する' }
    ],
    answerId: 'c',
    explanation: '飛び込み乗車などを確認した場合は、安全を優先して対応する。',
    sourceMaterialId: 'door-lever-safety-operation'
  },
  {
    id: 'stroller-orientation',
    category: 'ベビーカー',
    question: 'ベビーカーは進行方向に対してどちら向きに置きますか？',
    choices: [
      { id: 'a', text: '前向き' },
      { id: 'b', text: '後ろ向き' },
      { id: 'c', text: '横向き' },
      { id: 'd', text: '向きは決まっていない' }
    ],
    answerId: 'b',
    explanation: 'ベビーカーは進行方向に対して後ろ向きに置く。',
    sourceMaterialId: 'stroller'
  },
  {
    id: 'stroller-secure',
    category: 'ベビーカー',
    question: 'ベビーカーを固定するときに必要な対応は？',
    choices: [
      { id: 'a', text: '乗客が手で持つだけ' },
      { id: 'b', text: '車輪のストッパーだけ' },
      { id: 'c', text: '車輪のストッパー、シートベルト、固定ベルトを使用する' },
      { id: 'd', text: '荷物で囲む' }
    ],
    answerId: 'c',
    explanation: '車輪のストッパーとシートベルトを使用し、座席の固定ベルトで固定する。',
    sourceMaterialId: 'stroller'
  },
  {
    id: 'stroller-while-moving',
    category: 'ベビーカー',
    question: '走行中のベビーカーについて利用者へ案内する内容は？',
    choices: [
      { id: 'a', text: '走行中にベルトを外す' },
      { id: 'b', text: '車内を自由に移動する' },
      { id: 'c', text: '固定を解除せず、ベビーカーをしっかり支える' },
      { id: 'd', text: '手を離してよい' }
    ],
    answerId: 'c',
    explanation: '走行中は固定を解除せず、利用者自身にもベビーカーを支えてもらう。',
    sourceMaterialId: 'stroller'
  },
  {
    id: 'stroller-vs-wheelchair',
    category: 'ベビーカー',
    question: 'ベビーカーと車椅子の利用者が同時に乗車する場合、優先するのは？',
    choices: [
      { id: 'a', text: 'ベビーカー利用者' },
      { id: 'b', text: '車椅子利用者' },
      { id: 'c', text: '先に声を掛けた利用者' },
      { id: 'd', text: 'どちらも乗車を断る' }
    ],
    answerId: 'b',
    explanation: '固定スペースの関係上、車椅子利用者を優先する。',
    sourceMaterialId: 'stroller'
  },
  {
    id: 'wheelchair-stop-confirm',
    category: '車椅子',
    question: '車椅子利用者が停留所付近にいる場合の正しい対応は？',
    choices: [
      { id: 'a', text: '合図がなければ通過する' },
      { id: 'b', text: '介助者がいなければ通過する' },
      { id: 'c', text: '停車して乗車の意思を確認する' },
      { id: 'd', text: '次の便を案内する' }
    ],
    answerId: 'c',
    explanation: '車椅子利用者が停留所付近にいる場合は、停車して乗車意思を確認する。',
    sourceMaterialId: 'wheelchair'
  },
  {
    id: 'wheelchair-stop-distance',
    category: '車椅子',
    question: '車椅子対応のため車両を停車させる位置の目安は？',
    choices: [
      { id: 'a', text: '歩道から約10cm' },
      { id: 'b', text: '歩道から約80cm' },
      { id: 'c', text: '歩道から約2m' },
      { id: 'd', text: '道路中央' }
    ],
    answerId: 'b',
    explanation: '資料に記載された約80cmを目安に、スロープを安全に扱える位置へ停車する。',
    sourceMaterialId: 'wheelchair'
  },
  {
    id: 'wheelchair-parking-hazard',
    category: '車椅子',
    question: '車椅子乗降対応を始める前に行う車両操作は？',
    choices: [
      { id: 'a', text: 'エンジン回転を上げる' },
      { id: 'b', text: '前照灯を消す' },
      { id: 'c', text: 'パーキングブレーキを作動し、ハザードを点灯する' },
      { id: 'd', text: '扉を閉めたまま発進準備をする' }
    ],
    answerId: 'c',
    explanation: '車両を確実に停止させ、周囲へ停車中であることを知らせる。',
    sourceMaterialId: 'wheelchair'
  },
  {
    id: 'health-stop-first',
    category: '体調異変・事故対応',
    question: '運行中に体調の異変を感じた場合、最優先で行うことは？',
    choices: [
      { id: 'a', text: '終点まで運行する' },
      { id: 'b', text: '速度を上げて営業所へ戻る' },
      { id: 'c', text: '安全な場所に車両を停止する' },
      { id: 'd', text: '乗客へ伝えず運行を続ける' }
    ],
    answerId: 'c',
    explanation: '無理に運行を続けず、安全な場所へ停止する。',
    sourceMaterialId: 'driver-health-emergency-response'
  },
  {
    id: 'accident-stop-first',
    category: '体調異変・事故対応',
    question: '事故発生直後に最初に行う対応は？',
    choices: [
      { id: 'a', text: 'その場を離れる' },
      { id: 'b', text: '営業所への連絡だけ行う' },
      { id: 'c', text: '車両を停止し、負傷者と二次事故の危険を確認する' },
      { id: 'd', text: '乗客へ何も説明しない' }
    ],
    answerId: 'c',
    explanation: 'まず停止し、負傷者の救護と二次事故防止を優先する。',
    sourceMaterialId: 'accident-response-guide'
  },
  {
    id: 'accident-contacts',
    category: '体調異変・事故対応',
    question: '事故発生時に必要な連絡先は？',
    choices: [
      { id: 'a', text: '家族だけ' },
      { id: 'b', text: '他の乗務員だけ' },
      { id: 'c', text: '警察、救急、営業所など必要な関係先' },
      { id: 'd', text: '連絡は不要' }
    ],
    answerId: 'c',
    explanation: '状況に応じて救急、警察、営業所へ速やかに連絡する。',
    sourceMaterialId: 'accident-response-guide'
  }
];

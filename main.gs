// Copyright(c) 2024 SuzuneMaimu (X/bc_hakumai)

// Youtube Channel id & name
const youtube_channels = {
  'CHANGE_ME: CHANNEL ID': 'CHANGE_ME: CHANNEL NAME'
};

// Twitch Channnel id & name
const twitch_channels = {
  'CHANGE_ME: CHANNEL ID': 'CHANGE_ME: CHANNEL NAME'
};

// Discord infomation
const discord = 'CHANGE_ME: https://discord.com/api/webhooks/...';
const youtube_url = 'https://www.youtube.com/watch?v=';
const twitch_url = 'https://www.twitch.tv/';

// SpreadSheet infomation
const sheetId = 'CHANGE_ME: スプレッドシートのID';
const spreadsheet = SpreadsheetApp.openById(sheetId);
const labels = [['title', 'published', 'updated', 'videoId', 'channel', 'live', 'scheduledStartTime']];

// Youtube RSS URL
var youtube_rss_url = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

// Youtube Infomation URL
const ns_yt = XmlService.getNamespace('yt', 'http://www.youtube.com/xml/schemas/2015');
const ns_media = XmlService.getNamespace('media', 'http://search.yahoo.com/mrss/');
const atom = XmlService.getNamespace('http://www.w3.org/2005/Atom');

// Twitch RSS URL
var twitch_rss_url = 'https://twitchrss.appspot.com/vod/';

// You must activate Day.js on GAS
const now = dayjs.dayjs();
const minute = now.minute();

/**
* Discordに投稿するテキスト文を作成する
*/
function description_text(lbc, time = now.format('YYYY/MM/DD HH:mm:ss')) {
  if (lbc == 'upcoming') {
    return time + 'から配信予定！';
  } else if (lbc == 'live') {
    return time + 'から配信中！';
  } else if (lbc == 'none') {
    return 'アーカイブはこちら';
  } else if (lbc == 'video') {
    return '動画が投稿されました';
  } else {
    return 'new content!';
  }
}

/**
* Discordに配信予約・配信開始を通知する
*/
function post2discord(data) {
  const type = 'application/json';

  var message = {};
  if (data.type === 'youtube') {
    const image_url = 'https://img.youtube.com/vi/' + data.videoId + '/maxresdefault.jpg';
    const cast_url = youtube_url + data.videoId;

    message = {
      username: data.channel,
      content: '',
      tts: false,
      embeds: [
        {
          type: 'rich',
          title: data.title,
          description: data.description_text,
          color: 0xFF0000,
          image: {
            url: image_url,
          },
          url: cast_url,
          footer: {
            text: data.time
          },
        },
      ],
    }
  } else if (data.type === 'twitch') {
    const cast_url = twitch_url + data.videoId;

    message = {
      username: data.channel,
      content: '',
      tts: false,
      embeds: [
        {
          type: 'rich',
          title: data.title,
          description: data.description_text,
          color: 0xFF0000,
          url: cast_url,
          footer: {
            text: data.time
          },
        },
      ],
    }
  }

  var options = {
    'method': 'post',
    'contentType': type,
    'payload': JSON.stringify(message),
  }

  // console.log('message: ' + JSON.stringify(message));

  try {
    UrlFetchApp.fetch(discord, options);
  } catch (e) {
    console.log(e);
  }
}

// ALL data sheet
function mergeSheet(channels) {
  console.log('mergeSheet');
  const main_sheet = set_sheet('main');
  const query_sheet = Object.values(channels).map((val) => {
    return 'QUERY(\'' + escape_html(val) + '\'!A:G, "select * offset 1", 0)';
  }).join(';');

  main_sheet.getRange(2, 1).setValue('=QUERY({' + query_sheet + '}, "where Col1 is not null order by Col3 desc", 0)');

}

/**
 * HTMLのエスケープ文字を変換する
 */
function escape_html(string) {
  if (typeof string !== 'string') {
    return string;
  }
  return string.replace(/[&'`"<>]/g, function (match) {
    return {
      '&': '&amp;',
      "'": '&#x27;',
      '`': '&#x60;',
      '"': '&quot;',
      '<': '&lt;',
      '>': '&gt;',
    }[match];
  });
}

// Auto sheet insert
function set_sheet(name) {
  var sheet = spreadsheet.getSheetByName(escape_html(name));
  if (sheet)
    return sheet;

  sheet = spreadsheet.insertSheet();
  sheet.setName(escape_html(name));
  sheet.getRange(1, 1, 1, labels.flat().length).setValues(labels);
  return sheet;
}

/**
 * スプレッドシートからVideoIdを検索する
 */
function findId(type, sheet, id, lastRow, updated) {

  var ids;
  var liveBroadcastContent = '';
  var scheduledStartTime = false;
  var actualStartTime = false;
  var video_info = {
    snippet: {
      liveBroadcastContent: ''
    },
    liveStreamingDetails: {
      scheduledStartTime: updated,
      actualStartTime: updated,
    }
  };

  try {
    ids = sheet.getRange(1, 4, lastRow).getValues().map(String);
  } catch (e) {
    ids = sheet.getRange(1, 4).getValues().map(String);
  }
  const index = ids.flat().indexOf(id);

  switch (type) {
    case 'youtube': {
      let stateCheck = false;
      let live;
      if (index !== -1) {
        live = sheet.getRange(index + 1, 6).getValues()[0][0];
        if (live === 'upcoming' || live === 'live') {
          const sst = sheet.getRange(index + 1, 7).getValues()[0][0];
          if (now.isAfter(dayjs.dayjs(sst))) {
            // 配信開始前かつ予定時刻を過ぎていた場合
            stateCheck = true;
          }
        }
      }

      if (index === -1 || stateCheck) {
        // Youtube APIから情報を取得し登録する
        try {
          video_info = YouTube.Videos.list('snippet, liveStreamingDetails', { id: id, fields: 'items(snippet(liveBroadcastContent), liveStreamingDetails(scheduledStartTime, actualStartTime))' }).items[0];
          console.log('Check Youtube Status: ' + video_info);
          liveBroadcastContent = 'liveStreamingDetails' in video_info ? video_info.snippet.liveBroadcastContent : 'video';
          scheduledStartTime = Object.keys(video_info).indexOf('liveStreamingDetails') >= 0 ? video_info.liveStreamingDetails.scheduledStartTime : false;
          actualStartTime = scheduledStartTime && Object.keys(video_info.liveStreamingDetails).indexOf('actualStartTime') >= 0 ? video_info.liveStreamingDetails.actualStartTime : false;

          if (index !== -1 && liveBroadcastContent === live) {
            // liveの状態に変化がないので通知済みとして扱い、シートの更新だけ行う
            console.log('This bloadcast is already notify.');
            return [false, liveBroadcastContent, scheduledStartTime, actualStartTime, index];
          }

          return [true, liveBroadcastContent, scheduledStartTime, actualStartTime, index];
        } catch (e) {
          console.log(e);
        }
      }
      break;
    };
    case 'twitch': {
      if (index === -1) {
        return [true, 'live', updated, updated, -1]
      }
      break;
    };
  }
  return [false, liveBroadcastContent, scheduledStartTime, actualStartTime];
}

/**
 * スプレッドシートに情報を登録する
 */
function storageForYoutube(id) {

  let return_info = false;

  var channel = youtube_channels[id];
  console.log('storage: ' + channel);
  var sheet = set_sheet(channel);

  var url = youtube_rss_url + id;
  var xml = UrlFetchApp.fetch(url).getContentText();
  var docs = XmlService.parse(xml);
  var root = docs.getRootElement();
  var items = root.getChildren('entry', atom).slice(0, 5);

  for (let i = 0; i < items.length; i++) {
    var lastRow = sheet.getLastRow();

    var title = items[i].getChildText('title', atom);
    var updated = dayjs.dayjs(items[i].getChildText('updated', atom));
    var published = dayjs.dayjs(items[i].getChildText('published', atom));
    var videoId = items[i].getChildText('videoId', ns_yt);

    var tmp = findId('youtube', sheet, videoId, lastRow, updated.format('YYYY/MM/DDTHH:mm:ss'));
    var tf = tmp[0];
    return_info = tf || return_info;
    var live = tmp[1];
    var sst = tmp[2];
    var ast = tmp[3];
    var sheet_update = tmp[4];
    return_info = sheet_update >= 0 || return_info;

    if (sheet_update >= 0) {
      // 更新
      console.log('store update: ' + title + ', index: ' + sheet_update, ', live: ' + live);
      sheet.getRange(sheet_update + 1, 1).setValue(title);
      sheet.getRange(sheet_update + 1, 2).setValue(published.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(sheet_update + 1, 3).setValue(updated.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(sheet_update + 1, 4).setValue(videoId);
      sheet.getRange(sheet_update + 1, 5).setValue(channel);
      sheet.getRange(sheet_update + 1, 6).setValue(live);

      if (sst != false) {
        sheet.getRange(sheet_update + 1, 7).setValue(dayjs.dayjs(sst).format('YYYY/MM/DDTHH:mm:ss'));
      }
    } else if (sheet_update === -1) {
      // 新規登録
      console.log('store: ' + title);
      sheet.getRange(lastRow + 1, 1).setValue(title);
      sheet.getRange(lastRow + 1, 2).setValue(published.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(lastRow + 1, 3).setValue(updated.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(lastRow + 1, 4).setValue(videoId);
      sheet.getRange(lastRow + 1, 5).setValue(channel);
      sheet.getRange(lastRow + 1, 6).setValue(live);

      if (sst != false) {
        sheet.getRange(lastRow + 1, 7).setValue(dayjs.dayjs(sst).format('YYYY/MM/DDTHH:mm:ss'));
      }
    }

    if (tf) {
      post2discord({
        type: 'youtube',
        channel: channel,
        title: title,
        videoId: videoId,
        time: now.format('YYYY/MM/DDTHH:mm:ss'),
        description_text: description_text(live, (ast != false ? dayjs.dayjs(ast).format('HH:mm') : dayjs.dayjs(sst).format('MM/DD HH:mm')))
      });
    }
  }
  return return_info;
}

/**
 * スプレッドシートに情報を登録する
 */
function storageForTwitch(id) {

  let return_info = false;

  var channel = twitch_channels[id];
  console.log('storage: ' + channel);
  var sheet = set_sheet(channel);

  var url = twitch_rss_url + id;
  var xml = UrlFetchApp.fetch(url).getContentText();
  var docs = XmlService.parse(xml);
  var root = docs.getRootElement();
  var items = root.getChild('channel').getChildren('item');

  for (let i = 0; i < items.length; i++) {
    var lastRow = sheet.getLastRow();

    var category = items[i].getChildText('category');
    if (category !== 'live') {
      // 配信中でない場合は何もしない
      continue;
    }

    var title = decodeURIComponent(items[i].getChildText('title'));
    var guid = items[i].getChildText('guid').replace('_live', '');
    var pubDate = dayjs.dayjs(items[i].getChildText('pubDate'));

    var tmp = findId('twitch', sheet, guid, lastRow, pubDate.format('YYYY/MM/DDTHH:mm:ss'));
    var tf = tmp[0];
    return_info = tf || return_info;
    var live = tmp[1];
    var sst = tmp[2];
    var ast = tmp[3];
    var sheet_update = tmp[4];
    return_info = sheet_update || return_info;

    if (sheet_update >= 0) {
      // 更新
      console.log('store update: ' + title + ', index: ' + sheet_update, ', live: ' + live);
      sheet.getRange(sheet_update + 1, 1).setValue(title);
      sheet.getRange(sheet_update + 1, 2).setValue(pubDate.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(sheet_update + 1, 3).setValue(now.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(sheet_update + 1, 4).setValue(guid);
      sheet.getRange(sheet_update + 1, 5).setValue(channel);
      sheet.getRange(sheet_update + 1, 6).setValue(live);

      if (sst != false) {
        sheet.getRange(sheet_update + 1, 7).setValue(dayjs.dayjs(sst).format('YYYY/MM/DDTHH:mm:ss'));
      }
    } else if (sheet_update === -1){
      // 新規登録
      console.log('store: ' + title);
      sheet.getRange(lastRow + 1, 1).setValue(title);
      sheet.getRange(lastRow + 1, 2).setValue(pubDate.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(lastRow + 1, 3).setValue(now.format('YYYY/MM/DDTHH:mm:ss'));
      sheet.getRange(lastRow + 1, 4).setValue(guid);
      sheet.getRange(lastRow + 1, 5).setValue(channel);
      sheet.getRange(lastRow + 1, 6).setValue(live);

      if (sst != false) {
        sheet.getRange(lastRow + 1, 7).setValue(dayjs.dayjs(sst).format('YYYY/MM/DDTHH:mm:ss'));
      }
    }

    if (tf) {
      post2discord({
        type: 'twitch',
        channel: channel,
        title: title,
        videoId: id,
        time: now.format('YYYY/MM/DDTHH:mm:ss'),
        description_text: description_text(live, (ast != false ? dayjs.dayjs(ast).format('HH:mm') : dayjs.dayjs(sst).format('MM/DD HH:mm')))
      });
    }
  }
  return return_info;
}

/**
 * 配信情報を取得するために最初に動作させるAPI
 */
function store() {

  var update = false;

  Object.keys(youtube_channels).forEach((id) => {
    update = storageForYoutube(id) || update;
  });

  if (update) {
    mergeSheet(youtube_channels);
    update = false;
  }

  Object.keys(twitch_channels).forEach((id) => {
    update = storageForTwitch(id) || update;
  });

  if (update) {
    mergeSheet(twitch_channels);
  }

  console.log('completed!');
}

import { EventEmitter } from "events";

export enum VideoState {
  UnknownNegativeOne = -1,
  Playing = 1,
  Paused = 2,
  Buffering = 3,
  UnknownFive = 5
}

export type Thumbnail = {
  height: number;
  url: string;
  width: number;
}

export type VideoDetails = {
  album: string,
  author: string,
  durationSeconds: number,
  thumbnails: Thumbnail[],
  title: string,
  id: string
};

export type PlayerQueueItem = {
  thumbnails: Thumbnail[],
  title: string,
  author: string,
  duration: string,
  selected: boolean
};

export type PlayerQueue = {
  automixItems: PlayerQueueItem[];
  autoplay: boolean;
  isGenerating: boolean;
  isInfinite: boolean;
  items: PlayerQueueItem[];
  repeatMode: "NONE" | "ALL" | "ONE";
  selectedItemIndex: number;
};

export type PlayerState = {
  videoDetails: VideoDetails;
  playlistId: string;
  trackState: VideoState;
  queue: PlayerQueue;
  videoProgress: number;
};

type YTMThumbnail = {
  height: number;
  url: string;
  width: number;
};

type YTMTextRun = {
  text: string;
};

type YTMText = {
  runs: YTMTextRun[];
};

type YTMPlayerQueueItemVideoRenderer = {
  lengthText: YTMText;
  selected: boolean;
  shortBylineText: YTMText;
  thumbnail: {
    thumbnails: YTMThumbnail[];
  };
  title: YTMText;
  videoId: string;
};

type YTMPlayerQueueItem = {
  playlistPanelVideoRenderer: YTMPlayerQueueItemVideoRenderer | null;
  playlistPanelVideoWrapperRenderer: {
    primaryRenderer: {
      playlistPanelVideoRenderer: YTMPlayerQueueItemVideoRenderer;
    };
  } | null;
};

type YTMPlayerQueue = {
  automixItems: YTMPlayerQueueItem[];
  autoplay: boolean;
  isGenerating: boolean;
  isInfinite: boolean;
  items: YTMPlayerQueueItem[];
  repeatMode: "NONE" | "ALL" | "ONE";
};

type YTMVideoDetails = {
  album: string,
  author: string,
  lengthSeconds: string,
  thumbnail: {
    thumbnails: YTMThumbnail[]
  },
  title: string,
  videoId: string
}

function getYTMTextRun(runs: YTMTextRun[]) {
  let final = "";
  for (const run of runs) {
    final += run.text;
  }
  return final;
}

function mapYTMThumbnails(thumbnail: YTMThumbnail) {
  // Explicit mapping to keep a consistent API
  // If YouTube Music changes how this is presented internally then it's easier to update without breaking the API
  return {
    url: thumbnail.url,
    width: thumbnail.width,
    height: thumbnail.height
  };
}

function mapYTMQueueItems(item: YTMPlayerQueueItem): PlayerQueueItem {
  let playlistPanelVideoRenderer;
  if (item.playlistPanelVideoRenderer) playlistPanelVideoRenderer = item.playlistPanelVideoRenderer;
  else if (item.playlistPanelVideoWrapperRenderer)
    playlistPanelVideoRenderer = item.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer;

  // This probably shouldn't happen but in the off chance it does we need to return nothing
  if (!playlistPanelVideoRenderer) return null;

  return {
    thumbnails: playlistPanelVideoRenderer.thumbnail.thumbnails.map(mapYTMThumbnails),
    title: getYTMTextRun(playlistPanelVideoRenderer.title.runs),
    author: getYTMTextRun(playlistPanelVideoRenderer.shortBylineText.runs),
    duration: getYTMTextRun(playlistPanelVideoRenderer.lengthText.runs),
    selected: playlistPanelVideoRenderer.selected
  };
}

class PlayerStateStore {
  private videoProgress = 0;
  private state: VideoState = -1;
  private videoDetails: VideoDetails | null = null;
  private playlistId: string | null = null;
  private queue: PlayerQueue | null = null;
  private eventEmitter = new EventEmitter();

  public getState(): PlayerState {
    return {
      videoDetails: this.videoDetails,
      playlistId: this.playlistId,
      trackState: this.state,
      queue: this.queue,
      videoProgress: this.videoProgress
    };
  }

  public getQueue() {
    return this.queue;
  }

  public getPlaylistId() {
    return this.playlistId;
  }

  public updateVideoProgress(progress: number) {
    this.videoProgress = progress;
    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public updateVideoState(state: VideoState) {
    this.state = state;
    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public updateVideoDetails(videoDetails: YTMVideoDetails, playlistId: string) {
    this.videoDetails = {
      author: videoDetails.author,
      title: videoDetails.title,
      album: videoDetails.album,
      thumbnails: videoDetails.thumbnail.thumbnails.map(mapYTMThumbnails),
      durationSeconds: parseInt(videoDetails.lengthSeconds),
      id: videoDetails.videoId
    };
    this.playlistId = playlistId;
    this.eventEmitter.emit("stateChanged", this.getState());
  }

  public updateQueue(queueState: YTMPlayerQueue | null) {
    const queueItems = queueState ? queueState.items.map(mapYTMQueueItems) : null;
    this.queue = queueState
      ? {
          // automixItems comes from an autoplay queue that isn't pushed yet to the main queue. A radio will never have automixItems (weird YTM distinction from autoplay vs radio)
          automixItems: queueState.automixItems.map(mapYTMQueueItems),
          autoplay: queueState.autoplay,
          isGenerating: queueState.isGenerating,
          // Observed state seems to be a radio having infinite true while an autoplay queue has infinite false
          isInfinite: queueState.isInfinite,
          items: queueState.items.map(mapYTMQueueItems),
          repeatMode: queueState.repeatMode,
          // YTM has a native selectedItemIndex property but that isn't updated correctly so we calculate it ourselves
          selectedItemIndex: queueItems.findIndex(item => {
            return item.selected;
          })
        }
      : null;
  }

  public addEventListener(listener: (state: PlayerState) => void) {
    this.eventEmitter.addListener("stateChanged", listener);
  }

  public removeEventListener(listener: (state: PlayerState) => void) {
    this.eventEmitter.removeListener("stateChanged", listener);
  }
}

export default new PlayerStateStore();
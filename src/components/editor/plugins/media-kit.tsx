import { BaseCaptionPlugin } from '@platejs/caption';
import {
    BaseAudioPlugin,
    BaseFilePlugin,
    BaseImagePlugin,
    BaseMediaEmbedPlugin,
    BasePlaceholderPlugin,
    BaseVideoPlugin,
} from '@platejs/media';
import { KEYS } from 'platejs';

import { AudioElement } from '@/components/ui/media-audio-node';
import { FileElement } from '@/components/ui/media-file-node';
import { ImageElement } from '@/components/ui/media-image-node';
import { VideoElement } from '@/components/ui/media-video-node';

export const MediaKit = [
    BaseImagePlugin.withComponent(ImageElement),
    BaseVideoPlugin.withComponent(VideoElement),
    BaseAudioPlugin.withComponent(AudioElement),
    BaseFilePlugin.withComponent(FileElement),
    BaseCaptionPlugin.configure({
        options: {
            query: {
                allow: [KEYS.img, KEYS.video, KEYS.audio, KEYS.file, KEYS.mediaEmbed],
            },
        },
    }),
    BaseMediaEmbedPlugin,
    BasePlaceholderPlugin,
];

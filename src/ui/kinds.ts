import type { ContentKind } from 'feedgrab';
import { FileText, Image, type LucideIcon, Music, Newspaper, Video } from 'lucide-react';

/** Display names and icons of feedgrab content kinds. */
export const KIND_INFO: Record<ContentKind, { label: string; plural: string; Icon: LucideIcon }> = {
  post: { label: 'Post', plural: 'Posts', Icon: Newspaper },
  image: { label: 'Image', plural: 'Images', Icon: Image },
  video: { label: 'Video', plural: 'Videos', Icon: Video },
  audio: { label: 'Audio', plural: 'Audio', Icon: Music },
  pdf: { label: 'PDF', plural: 'PDFs', Icon: FileText },
};

export const KINDS = Object.keys(KIND_INFO) as ContentKind[];

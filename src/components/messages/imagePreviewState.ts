import { create } from 'zustand'

/** 图片预览的内容：只存附件 id，原件由预览组件自己读取，避免列表卸载后地址失效 */
type PreviewImage = {
  id: string
  name: string
}

type ImagePreviewState = {
  image: PreviewImage | null
}

export const useImagePreview = create<ImagePreviewState>(() => ({ image: null }))

export const openImagePreview = (image: PreviewImage) => useImagePreview.setState({ image })

export const closeImagePreview = () => useImagePreview.setState({ image: null })

declare module 'qrcode' {
  interface QRCodeOptions {
    width?: number
    margin?: number
    color?: {
      dark?: string
      light?: string
    }
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  }

  interface QRCode {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: QRCodeOptions
    ): Promise<void>
    toDataURL(
      text: string,
      options?: QRCodeOptions
    ): Promise<string>
  }

  const qrcode: QRCode
  export default qrcode
}

// Print the text on a screenshot, so a test log can say what the player would have seen.
// Usage: ocr <image.png>
import AppKit
import Vision

guard CommandLine.arguments.count > 1,
      let image = NSImage(contentsOfFile: CommandLine.arguments[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("(no image)")
    exit(1)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
do {
    try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request])
} catch {
    print("(could not read the screen: \(error))")
    exit(1)
}
let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
print(lines.joined(separator: " | "))

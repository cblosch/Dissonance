# Stock Man

A character rig built entirely out of stock photos of guys. There's no 3D model. Each body part is a flat photo card that turns to face the camera, and it swaps to a different photo depending on which side of that part you're looking at, like eight-direction sprites in old games. Every part is a different guy.

Animations: idle, walk, run, jump, wave and dance. Walk and Run send him around the studio in a circle so you can watch the photos swap as his angle changes.

## Running it

From the project root:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/stockrig/
```

| Input | Action |
| --- | --- |
| Drag | Orbit the camera (turns off auto-orbit) |
| Scroll | Zoom |
| W A S D / arrows | Walk, relative to the camera |
| Shift | Run |
| Space | Jump |

The panel in the bottom left shows which angle the camera is seeing each part from and whether it's using a real photo, a flipped one, or a placeholder.

## Adding the photos

It ships with drawn placeholder "stock photos" (watermark included). To swap in real ones:

- **Quick test:** click **Photos**, then click a slot or drop an image onto it. Or use **Load folder** with files named like below.
- **Permanent:** put the files in `stockrig/images/` and list them in `images/manifest.json`:

```json
{
  "head_front": "head_front.jpg",
  "head_front-left": "head_front-left.jpg"
}
```

Photos are center-cropped to fit each card, so you don't need to crop them exactly.

### Shot list

Six parts, each its own guy: `head`, `torso`, `upperArm`, `forearm`, `thigh`, `shin`.

Eight angles, named for where the camera is relative to the way he faces: `front`, `front-left`, `left`, `back-left`, `back`, `back-right`, `right`, `front-right`. "left" means you're looking at his left side, so he faces toward the left edge of the photo.

You only need the first five angles. If a right-side angle is missing, the rig flips the matching left-side photo. That's 30 photos for a full set.

| Part | What to look for |
| --- | --- |
| head | Headshots. Front, three-quarter, profile, and the back of a head |
| torso | Shirt and tie, cropped from the neck to the belt |
| upperArm | Short sleeve or polo, shoulder to elbow |
| forearm | Elbow down to the hand. Watch optional but encouraged |
| thigh | Khakis, hip to knee |
| shin | Knee down, shoe at the bottom |

Free-license sources like Pexels and Unsplash have plenty of these. Search terms like "businessman profile", "man back of head" and "man khakis walking" work well.

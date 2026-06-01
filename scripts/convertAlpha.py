from PIL import Image
import numpy as np

im = Image.open('AyazianGamesLogo.png').convert('RGBA')
ni = np.array(im)
# Set alpha channel to (255 - Red channel value)
# This makes white (255) -> 0 alpha and black (0) -> 255 alpha
ni[..., 3] = 255 - ni[..., 0]
Image.fromarray(ni).save('AyazianGamesLogoAlpha.png')
# Set Red/Green/Blue channels to black (0)
ni[..., 0] = 0 * ni[..., 0]
ni[..., 1] = 0 * ni[..., 0]
ni[..., 2] = 0 * ni[..., 0]
Image.fromarray(ni).save('AyazianGamesLogoAlpha2.png')

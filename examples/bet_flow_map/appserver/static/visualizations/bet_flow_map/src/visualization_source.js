/*
 * Geographic Bet Flow Map — Splunk Custom Visualization
 *
 * Simplified world map showing animated particle flows from bet origin
 * countries to the match venue. Size/intensity proportional to betting volume.
 *
 * Expected SPL columns: country (required), lat (required), lon (required),
 *   volume (required), venue_lat (optional), venue_lon (optional)
 */
define([
    'api/SplunkVisualizationBase',
    'api/SplunkVisualizationUtils'
], function(SplunkVisualizationBase, SplunkVisualizationUtils) {

    // ── Constants ───────────────────────────────────────────────

    var ANIM_INTERVALS = { slow: 60, medium: 35, fast: 18 };
    var PARTICLE_COUNTS = { low: 3, medium: 6, high: 10 };

    // ── Continent Outlines (simplified [lon, lat] coordinates) ──

    var CONTINENTS = [
        // ── North America (mainland) ──
        [
            [-168, 65], [-165, 62], [-163, 60], [-164, 58], [-162, 56],
            [-159, 55], [-153, 57], [-152, 59], [-148, 60], [-141, 60],
            [-139, 59], [-137, 58], [-136, 57], [-135, 56], [-133, 55],
            [-131, 54], [-130, 53], [-128, 51], [-126, 49], [-124, 48],
            [-123, 46], [-124, 43], [-121, 39], [-118, 34], [-117, 32],
            [-115, 30], [-112, 29], [-110, 27], [-108, 26], [-106, 24],
            [-105, 22], [-104, 20], [-103, 19], [-101, 18], [-99, 17],
            [-97, 16], [-95, 16], [-93, 15], [-91, 15], [-89, 16],
            [-88, 17], [-88, 18], [-90, 19], [-91, 19], [-91, 21],
            [-90, 22], [-88, 21], [-87, 20], [-87, 18], [-85, 16],
            [-84, 14], [-83, 12], [-82, 10], [-81, 9], [-79, 8],
            [-78, 8], [-77, 9], [-80, 10], [-82, 11], [-83, 13],
            [-84, 15], [-85, 16], [-87, 18], [-87, 20], [-88, 22],
            [-90, 25], [-92, 28], [-93, 30], [-94, 30], [-96, 28],
            [-97, 26], [-97, 28], [-95, 30], [-93, 30], [-90, 30],
            [-89, 30], [-89, 29], [-90, 29], [-91, 29], [-92, 30],
            [-89, 31], [-85, 30], [-84, 31], [-82, 30], [-81, 31],
            [-80, 32], [-80, 33], [-79, 34], [-76, 35], [-75, 36],
            [-76, 37], [-76, 38], [-75, 39], [-74, 40], [-73, 41],
            [-72, 41], [-71, 42], [-70, 42], [-69, 42], [-68, 44],
            [-67, 45], [-66, 44], [-66, 43], [-68, 42], [-69, 42],
            [-70, 43], [-71, 42], [-70, 41], [-72, 41], [-73, 40],
            [-74, 40], [-75, 39], [-74, 38], [-73, 39], [-72, 41],
            [-70, 42], [-69, 43], [-68, 44], [-67, 45], [-67, 47],
            [-65, 47], [-63, 46], [-61, 46], [-60, 47], [-61, 49],
            [-63, 49], [-64, 48], [-65, 48], [-66, 49], [-65, 50],
            [-63, 50], [-60, 50], [-58, 49], [-56, 48], [-53, 47],
            [-55, 50], [-56, 52], [-59, 53], [-59, 55], [-57, 55],
            [-55, 53], [-54, 50], [-53, 48], [-55, 47], [-57, 47],
            [-59, 48], [-62, 50], [-64, 52], [-66, 54], [-67, 56],
            [-65, 58], [-63, 59], [-64, 60], [-68, 60], [-72, 59],
            [-76, 58], [-78, 56], [-79, 55], [-81, 54], [-82, 53],
            [-82, 51], [-83, 50], [-85, 49], [-87, 48], [-88, 49],
            [-89, 48], [-88, 47], [-87, 46], [-86, 45], [-84, 46],
            [-82, 46], [-81, 45], [-82, 43], [-83, 42], [-82, 42],
            [-80, 43], [-79, 43], [-78, 44], [-77, 44], [-75, 45],
            [-74, 45], [-75, 44], [-79, 43], [-81, 42], [-83, 41],
            [-87, 41], [-88, 42], [-87, 44], [-86, 46], [-88, 48],
            [-92, 47], [-93, 48], [-95, 49], [-95, 51], [-94, 53],
            [-92, 55], [-88, 56], [-86, 57], [-84, 58], [-82, 60],
            [-80, 62], [-82, 64], [-85, 65], [-88, 66], [-90, 68],
            [-94, 69], [-97, 70], [-100, 72], [-105, 72], [-110, 72],
            [-115, 72], [-120, 71], [-125, 71], [-130, 70], [-135, 69],
            [-140, 68], [-145, 67], [-150, 66], [-155, 65], [-160, 64],
            [-163, 63], [-165, 62], [-168, 65]
        ],
        // ── Greenland ──
        [
            [-45, 60], [-48, 61], [-50, 63], [-52, 65], [-54, 67],
            [-53, 69], [-51, 70], [-49, 72], [-46, 73], [-43, 75],
            [-40, 76], [-36, 77], [-30, 78], [-24, 78], [-20, 77],
            [-18, 76], [-18, 74], [-20, 72], [-22, 71], [-24, 70],
            [-26, 68], [-28, 67], [-30, 66], [-33, 65], [-36, 63],
            [-38, 62], [-40, 61], [-43, 60], [-45, 60]
        ],
        // ── South America ──
        [
            [-77, 10], [-75, 11], [-73, 12], [-72, 12], [-70, 12],
            [-68, 11], [-65, 10], [-63, 10], [-61, 10], [-60, 9],
            [-60, 7], [-58, 7], [-57, 6], [-55, 6], [-53, 5],
            [-51, 4], [-50, 3], [-49, 2], [-48, 0], [-49, -1],
            [-48, -2], [-45, -3], [-42, -3], [-40, -2], [-38, -3],
            [-36, -5], [-35, -7], [-35, -9], [-36, -11], [-37, -13],
            [-38, -14], [-39, -15], [-39, -17], [-40, -19], [-41, -21],
            [-41, -23], [-43, -23], [-45, -24], [-47, -25], [-48, -27],
            [-49, -28], [-50, -30], [-51, -31], [-52, -33], [-53, -34],
            [-54, -34], [-55, -33], [-57, -34], [-58, -35], [-57, -36],
            [-58, -38], [-60, -39], [-62, -39], [-64, -40], [-65, -41],
            [-65, -43], [-66, -45], [-67, -46], [-67, -48], [-66, -49],
            [-66, -51], [-68, -52], [-69, -53], [-71, -54], [-73, -55],
            [-74, -52], [-73, -50], [-72, -48], [-73, -46], [-74, -44],
            [-73, -42], [-72, -40], [-71, -38], [-71, -35], [-71, -33],
            [-71, -30], [-70, -27], [-70, -24], [-70, -21], [-70, -18],
            [-71, -16], [-75, -14], [-76, -12], [-77, -10], [-78, -7],
            [-80, -3], [-80, -1], [-80, 1], [-79, 3], [-78, 5],
            [-77, 7], [-77, 8], [-77, 10]
        ],
        // ── Europe (mainland) ──
        [
            [-9, 36], [-8, 37], [-9, 39], [-9, 41], [-8, 42],
            [-8, 43], [-2, 44], [-1, 43], [0, 43], [3, 43],
            [3, 44], [1, 46], [-1, 47], [-2, 47], [-4, 48],
            [-5, 48], [-4, 47], [-2, 47], [-1, 46], [1, 46],
            [2, 47], [3, 47], [5, 47], [6, 46], [7, 44],
            [9, 44], [11, 44], [13, 43], [13, 42], [12, 42],
            [12, 44], [10, 44], [8, 45], [7, 46], [7, 47],
            [8, 48], [9, 48], [10, 47], [12, 47], [13, 48],
            [14, 48], [14, 47], [16, 46], [17, 46], [18, 45],
            [20, 45], [20, 43], [21, 42], [22, 41], [23, 40],
            [24, 38], [26, 38], [27, 37], [28, 36], [27, 37],
            [26, 38], [26, 40], [28, 41], [29, 42], [28, 43],
            [28, 44], [29, 45], [30, 46], [31, 46], [33, 46],
            [34, 45], [36, 46], [38, 47], [40, 47], [40, 46],
            [42, 45], [43, 42], [42, 41], [40, 41], [39, 42],
            [37, 42], [36, 42], [36, 41], [36, 37], [36, 36],
            // Now trace north through Black Sea region / Eastern Europe
            [42, 42], [43, 42], [42, 45], [40, 47], [38, 48],
            [35, 48], [33, 48], [31, 48], [29, 48], [27, 48],
            [25, 49], [24, 50], [22, 50], [20, 50], [18, 49],
            [17, 49], [15, 49], [14, 50], [14, 52], [15, 54],
            [14, 54], [13, 55], [12, 55], [11, 55], [10, 55],
            [10, 57], [12, 56], [12, 58], [11, 58], [8, 58],
            [8, 57], [9, 57], [10, 55], [9, 54], [8, 55],
            [7, 54], [4, 53], [3, 52], [4, 52], [5, 52],
            [6, 52], [7, 53], [8, 54], [9, 54], [10, 54],
            [10, 53], [7, 53], [4, 52], [3, 52], [3, 53],
            // Baltic / Nordic coast
            [10, 54], [12, 55], [14, 54], [14, 55], [16, 55],
            [18, 55], [19, 55], [20, 56], [21, 57], [22, 58],
            [23, 58], [24, 58], [24, 59], [26, 60], [28, 60],
            [30, 60], [30, 62], [28, 64], [26, 65], [24, 66],
            [22, 66], [20, 65], [18, 64], [16, 63], [14, 63],
            [13, 64], [14, 66], [15, 67], [16, 68], [17, 69],
            [18, 70], [20, 70], [22, 70], [25, 71], [28, 71],
            [30, 70], [32, 70], [33, 69], [36, 69], [40, 68],
            [42, 67], [44, 68], [50, 70], [55, 70], [60, 70],
            [65, 70], [70, 69], [70, 68], [60, 68], [50, 68],
            [42, 66], [40, 65], [38, 64], [35, 63], [32, 62],
            [30, 60], [28, 59], [26, 58], [24, 57], [22, 56],
            [20, 55], [18, 54], [16, 54], [14, 53], [14, 52],
            [13, 51], [12, 51], [10, 52], [8, 52], [6, 51],
            [5, 51], [4, 51], [3, 51], [2, 51], [1, 51],
            [0, 50], [-1, 49], [-2, 48], [-4, 48], [-5, 47],
            [-3, 47], [-1, 47], [-1, 44], [-2, 43], [-5, 43],
            [-8, 43], [-9, 42], [-9, 40], [-8, 38], [-7, 37],
            [-8, 37], [-9, 36]
        ],
        // ── British Isles (Great Britain) ──
        [
            [-5, 50], [-5, 51], [-4, 52], [-3, 52], [-3, 53],
            [-4, 54], [-5, 54], [-5, 55], [-6, 56], [-5, 57],
            [-5, 58], [-4, 58], [-3, 58], [-2, 57], [-2, 56],
            [-1, 55], [0, 54], [1, 53], [2, 53], [2, 52],
            [1, 51], [1, 51], [0, 51], [-1, 50], [-3, 50],
            [-5, 50]
        ],
        // ── Ireland ──
        [
            [-10, 52], [-10, 53], [-9, 54], [-8, 55], [-7, 55],
            [-6, 55], [-6, 54], [-7, 53], [-8, 52], [-9, 51],
            [-10, 52]
        ],
        // ── Italy ──
        [
            [8, 44], [9, 44], [10, 44], [11, 43], [12, 43],
            [13, 42], [14, 42], [14, 41], [15, 41], [16, 40],
            [16, 39], [16, 38], [16, 38], [15, 38], [15, 39],
            [14, 38], [13, 38], [12, 38], [13, 39], [14, 39],
            [15, 40], [14, 41], [13, 41], [12, 42], [11, 42],
            [10, 43], [9, 44], [8, 44]
        ],
        // ── Sicily ──
        [
            [13, 38], [13, 37], [14, 37], [15, 37], [15, 38],
            [14, 38], [13, 38]
        ],
        // ── Sardinia ──
        [
            [8, 39], [9, 39], [10, 39], [10, 40], [9, 41],
            [8, 41], [8, 40], [8, 39]
        ],
        // ── Scandinavia (Norway/Sweden) ──
        [
            [5, 58], [5, 60], [5, 62], [6, 63], [8, 63],
            [10, 63], [12, 64], [14, 65], [15, 66], [14, 67],
            [15, 68], [16, 69], [18, 69], [19, 70], [20, 70],
            [22, 70], [24, 70], [25, 71], [27, 71], [29, 71],
            [30, 70], [28, 69], [26, 68], [24, 67], [20, 65],
            [18, 64], [18, 62], [18, 60], [17, 59], [16, 58],
            [16, 57], [15, 56], [14, 56], [13, 56], [12, 56],
            [11, 58], [8, 58], [6, 58], [5, 58]
        ],
        // ── Africa ──
        [
            [-13, 28], [-15, 25], [-17, 22], [-17, 20], [-17, 17],
            [-16, 14], [-16, 12], [-15, 11], [-14, 11], [-13, 12],
            [-15, 10], [-15, 8], [-14, 7], [-13, 5], [-11, 5],
            [-9, 5], [-8, 4], [-5, 5], [-4, 5], [-3, 5],
            [-1, 5], [1, 6], [2, 6], [3, 6], [5, 5],
            [7, 4], [9, 4], [10, 2], [10, 1], [9, 1],
            [9, 2], [10, 4], [11, 5], [13, 5], [14, 4],
            [15, 3], [16, 2], [16, 4], [14, 6], [13, 8],
            [14, 9], [15, 8], [16, 7], [16, 5], [18, 3],
            [20, 4], [24, 5], [28, 4], [30, 3], [32, 2],
            [33, 1], [34, 0], [34, -1], [37, -3], [39, -5],
            [40, -7], [40, -10], [40, -12], [40, -15], [38, -17],
            [36, -18], [35, -20], [35, -22], [35, -24], [34, -26],
            [33, -28], [32, -29], [30, -30], [29, -31], [28, -33],
            [27, -34], [25, -34], [23, -34], [21, -34], [19, -34],
            [18, -33], [17, -32], [16, -29], [15, -27], [14, -24],
            [13, -22], [12, -18], [12, -14], [12, -10], [12, -6],
            [12, -4], [11, -2], [10, 0], [9, 1], [10, 1],
            [10, 2], [9, 4], [7, 4], [5, 5], [3, 6],
            [1, 6], [-1, 5], [-3, 5], [-5, 5], [-8, 4],
            [-9, 5], [-11, 5], [-13, 5], [-14, 7], [-15, 8],
            [-15, 10], [-13, 12], [-14, 11], [-15, 11], [-16, 12],
            [-16, 14], [-17, 17], [-17, 20], [-17, 22], [-15, 25],
            [-13, 28], [-13, 30], [-10, 32], [-8, 33], [-5, 34],
            [-2, 35], [0, 36], [3, 37], [5, 37], [8, 37],
            [10, 37], [11, 34], [11, 32], [10, 30], [10, 28],
            [10, 25], [10, 23], [12, 23], [15, 23], [16, 23],
            [20, 24], [22, 25], [24, 27], [25, 28], [25, 30],
            [28, 31], [30, 31], [32, 31], [33, 31], [35, 32],
            [36, 33], [36, 35], // up to Mediterranean coast
            [33, 34], [32, 33], [30, 32], [25, 32], [20, 32],
            [15, 32], [12, 33], [10, 34], [9, 35], [8, 36],
            [5, 37], [3, 37], [0, 36], [-2, 35], [-5, 34],
            [-5, 36], [-9, 36], [-10, 35], [-13, 30], [-13, 28]
        ],
        // ── Madagascar ──
        [
            [44, -12], [45, -14], [47, -16], [48, -18], [49, -20],
            [49, -22], [48, -24], [47, -25], [45, -25], [44, -24],
            [44, -22], [43, -20], [43, -18], [44, -16], [44, -14],
            [44, -12]
        ],
        // ── Arabian Peninsula ──
        [
            [36, 30], [38, 28], [40, 26], [42, 24], [43, 22],
            [43, 19], [44, 17], [45, 14], [46, 13], [48, 14],
            [50, 15], [52, 17], [54, 18], [55, 20], [56, 22],
            [56, 24], [55, 25], [54, 26], [52, 24], [51, 24],
            [50, 25], [50, 26], [49, 27], [48, 28], [48, 29],
            [48, 30], [47, 30], [46, 29], [44, 29], [42, 30],
            [40, 31], [38, 31], [36, 32], [36, 30]
        ],
        // ── Asia (mainland) ──
        [
            [28, 42], [30, 42], [33, 42], [36, 42], [38, 42],
            [40, 42], [42, 42], [43, 42], [44, 40], [44, 38],
            [44, 36], [46, 34], [48, 32], [50, 30], [52, 28],
            [54, 26], [56, 26], [57, 25], [58, 25], [60, 25],
            [62, 25], [64, 25], [66, 25], [68, 24], [70, 22],
            [71, 21], [72, 20], [73, 18], [73, 16], [75, 15],
            [77, 12], [78, 10], [79, 8], [80, 7], [80, 9],
            [81, 10], [82, 12], [83, 14], [84, 16], [85, 17],
            [87, 18], [88, 20], [89, 22], [90, 22], [91, 23],
            [92, 22], [93, 20], [94, 19], [96, 17], [97, 16],
            [98, 15], [99, 13], [99, 11], [100, 10], [100, 8],
            [101, 6], [101, 4], [103, 2], [104, 1], [104, 2],
            [105, 5], [106, 8], [106, 10], [108, 12], [108, 14],
            [108, 16], [107, 17], [106, 18], [106, 20], [107, 21],
            [108, 22], [110, 22], [112, 22], [114, 22], [116, 22],
            [117, 24], [118, 25], [119, 26], [120, 27], [121, 28],
            [121, 30], [122, 31], [121, 32], [120, 33], [120, 34],
            [119, 35], [120, 36], [121, 37], [122, 38], [122, 39],
            [121, 40], [120, 40], [119, 40], [118, 39], [117, 38],
            [118, 39], [119, 40], [121, 40], [122, 41], [123, 42],
            [124, 40], [126, 38], [127, 36], [128, 36], [129, 35],
            [129, 36], [128, 38], [127, 40], [129, 40], [130, 42],
            [131, 43], [131, 44], [132, 45], [134, 46], [135, 48],
            [137, 50], [139, 52], [140, 53], [141, 54], [142, 55],
            [143, 56], [144, 58], [145, 60], [150, 60], [155, 59],
            [158, 58], [160, 60], [163, 62], [165, 64], [170, 65],
            [175, 64], [178, 63], [180, 65], [180, 68], [178, 70],
            [175, 72], [170, 72], [165, 70], [160, 70], [155, 70],
            [150, 70], [145, 70], [140, 72], [135, 73], [130, 73],
            [125, 74], [120, 73], [115, 73], [110, 73], [105, 73],
            [100, 72], [95, 72], [90, 72], [85, 72], [80, 72],
            [75, 72], [70, 70], [65, 70], [60, 70], [55, 70],
            [50, 70], [45, 68], [42, 67], [40, 65], [38, 64],
            [35, 63], [33, 62], [31, 60], [30, 60], [28, 58],
            [27, 56], [28, 54], [28, 52], [29, 50], [30, 48],
            [29, 47], [28, 45], [28, 43], [28, 42]
        ],
        // ── India (subcontinent) ──
        [
            [68, 24], [70, 22], [71, 21], [72, 20], [73, 18],
            [73, 16], [75, 15], [76, 13], [77, 11], [78, 9],
            [79, 8], [80, 7], [80, 9], [81, 10], [82, 12],
            [83, 14], [84, 16], [85, 17], [87, 18], [88, 20],
            [89, 22], [90, 22], [91, 23], [92, 22], [93, 22],
            [92, 24], [90, 25], [88, 26], [87, 26], [85, 27],
            [83, 28], [82, 28], [81, 29], [80, 29], [80, 30],
            [78, 31], [76, 32], [74, 33], [73, 34], [71, 34],
            [70, 33], [68, 32], [67, 30], [66, 28], [67, 26],
            [68, 24]
        ],
        // ── Japan (Honshu + rough chain) ──
        [
            [130, 31], [131, 32], [131, 33], [132, 34], [133, 34],
            [134, 34], [135, 35], [136, 36], [137, 37], [138, 37],
            [139, 38], [140, 38], [140, 39], [140, 40], [140, 41],
            [141, 42], [141, 43], [142, 44], [143, 44], [144, 45],
            [145, 45], [145, 44], [144, 43], [143, 42], [142, 42],
            [141, 41], [141, 40], [140, 39], [140, 38], [139, 37],
            [139, 36], [138, 36], [137, 35], [136, 35], [135, 34],
            [134, 33], [133, 33], [132, 32], [131, 31], [130, 31]
        ],
        // ── Hokkaido ──
        [
            [140, 42], [141, 42], [142, 43], [143, 43], [145, 44],
            [145, 43], [145, 42], [144, 42], [143, 42], [142, 42],
            [141, 42], [140, 42]
        ],
        // ── Kyushu ──
        [
            [130, 31], [130, 32], [131, 33], [132, 33], [131, 32],
            [131, 31], [130, 31]
        ],
        // ── Indonesia (Sumatra) ──
        [
            [95, 6], [97, 4], [99, 2], [100, 0], [101, -1],
            [103, -2], [104, -4], [105, -5], [106, -6], [105, -6],
            [104, -5], [103, -3], [101, -2], [100, -1], [98, 0],
            [97, 2], [95, 4], [95, 6]
        ],
        // ── Indonesia (Java) ──
        [
            [106, -6], [107, -6], [108, -7], [110, -7], [112, -7],
            [113, -8], [114, -8], [114, -8], [113, -8], [111, -8],
            [109, -8], [107, -7], [106, -7], [106, -6]
        ],
        // ── Indonesia (Borneo / Kalimantan) ──
        [
            [108, 5], [109, 4], [110, 2], [111, 1], [112, 1],
            [114, 1], [116, 1], [117, 2], [118, 3], [119, 4],
            [118, 5], [117, 5], [116, 5], [115, 4], [114, 2],
            [115, 1], [116, 0], [117, -1], [118, -2], [117, -3],
            [116, -4], [115, -4], [114, -3], [112, -3], [111, -2],
            [110, -1], [109, 0], [109, 1], [108, 2], [108, 3],
            [108, 5]
        ],
        // ── Indonesia (Sulawesi) ──
        [
            [120, -1], [121, -2], [122, -3], [122, -4], [121, -5],
            [120, -5], [119, -4], [120, -3], [121, -2], [120, -1]
        ],
        // ── Papua New Guinea / New Guinea ──
        [
            [131, -2], [133, -3], [135, -4], [137, -5], [139, -6],
            [141, -7], [143, -7], [145, -6], [147, -6], [148, -5],
            [150, -6], [150, -7], [149, -8], [147, -8], [145, -7],
            [143, -8], [141, -8], [141, -9], [143, -9], [144, -8],
            [146, -8], [148, -9], [147, -10], [145, -9], [143, -9],
            [141, -9], [140, -8], [138, -7], [136, -6], [134, -5],
            [132, -4], [131, -3], [131, -2]
        ],
        // ── Philippines (Luzon + Mindanao rough) ──
        [
            [117, 18], [118, 17], [119, 16], [120, 15], [121, 14],
            [122, 13], [123, 12], [124, 11], [125, 10], [126, 9],
            [126, 8], [126, 7], [125, 7], [124, 8], [124, 9],
            [123, 10], [122, 11], [121, 12], [120, 13], [120, 15],
            [119, 16], [118, 17], [117, 18]
        ],
        // ── Australia ──
        [
            [114, -22], [114, -24], [114, -26], [114, -28], [115, -30],
            [115, -32], [115, -34], [116, -35], [118, -35], [120, -34],
            [122, -34], [124, -33], [126, -33], [128, -33], [130, -32],
            [132, -32], [133, -33], [134, -34], [136, -35], [137, -36],
            [138, -36], [139, -37], [141, -38], [143, -38], [145, -38],
            [147, -38], [149, -37], [150, -37], [151, -34], [153, -31],
            [153, -28], [153, -27], [152, -25], [151, -24], [150, -23],
            [149, -21], [148, -20], [147, -19], [146, -18], [146, -17],
            [145, -16], [144, -15], [143, -14], [142, -13], [141, -13],
            [139, -12], [137, -12], [136, -12], [135, -13], [134, -12],
            [133, -12], [132, -12], [131, -12], [130, -13], [129, -14],
            [128, -14], [127, -14], [126, -14], [125, -14], [124, -15],
            [123, -16], [122, -17], [121, -18], [120, -19], [118, -20],
            [117, -20], [116, -21], [115, -22], [114, -22]
        ],
        // ── Tasmania ──
        [
            [145, -40], [146, -41], [147, -42], [148, -43], [148, -43],
            [147, -43], [146, -43], [145, -42], [145, -41], [145, -40]
        ],
        // ── New Zealand (North Island) ──
        [
            [173, -35], [174, -36], [175, -37], [176, -38], [177, -38],
            [178, -38], [178, -37], [177, -37], [176, -36], [175, -36],
            [174, -35], [173, -35]
        ],
        // ── New Zealand (South Island) ──
        [
            [167, -44], [168, -45], [169, -46], [170, -46], [171, -45],
            [172, -44], [173, -43], [174, -42], [174, -41], [173, -41],
            [172, -41], [171, -42], [170, -43], [169, -44], [168, -44],
            [167, -44]
        ],
        // ── Sri Lanka ──
        [
            [80, 10], [81, 9], [82, 8], [82, 7], [81, 6],
            [80, 6], [80, 7], [80, 8], [80, 10]
        ],
        // ── Taiwan ──
        [
            [120, 25], [121, 24], [121, 23], [121, 22], [120, 22],
            [120, 23], [120, 24], [120, 25]
        ],
        // ── Korean Peninsula ──
        [
            [126, 34], [127, 35], [128, 36], [129, 36], [129, 37],
            [128, 38], [127, 39], [126, 39], [125, 40], [126, 42],
            [127, 42], [129, 42], [130, 42], [130, 40], [129, 39],
            [129, 38], [129, 36], [128, 35], [127, 34], [126, 34]
        ],
        // ── Kamchatka Peninsula ──
        [
            [156, 52], [157, 53], [158, 54], [159, 55], [160, 57],
            [161, 58], [162, 60], [163, 61], [163, 60], [162, 58],
            [161, 56], [160, 55], [159, 54], [158, 53], [157, 52],
            [156, 52]
        ]
    ];

    // ── Helper Functions (pure, no `this`) ──────────────────────

    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function formatNumber(n) {
        var s = Math.round(n).toString();
        var result = '';
        for (var i = s.length - 1, c = 0; i >= 0; i--, c++) {
            if (c > 0 && c % 3 === 0) result = ',' + result;
            result = s[i] + result;
        }
        return result;
    }

    // Equirectangular projection: lon/lat to canvas x/y
    function lonLatToXY(lon, lat, mapW, mapH, offsetX, offsetY) {
        var x = (lon + 180) / 360 * mapW + offsetX;
        var y = (90 - lat) / 180 * mapH + offsetY;
        return { x: x, y: y };
    }

    // Quadratic bezier point at parameter t
    function bezierPoint(t, p0x, p0y, cpx, cpy, p1x, p1y) {
        var mt = 1 - t;
        var x = mt * mt * p0x + 2 * mt * t * cpx + t * t * p1x;
        var y = mt * mt * p0y + 2 * mt * t * cpy + t * t * p1y;
        return { x: x, y: y };
    }

    // Calculate control point for curved arc between two points
    function calcControlPoint(x0, y0, x1, y1) {
        var mx = (x0 + x1) / 2;
        var my = (y0 + y1) / 2;
        var dx = x1 - x0;
        var dy = y1 - y0;
        var dist = Math.sqrt(dx * dx + dy * dy);
        // Perpendicular offset proportional to distance
        var bulge = dist * 0.3;
        // Always curve upward (negative y)
        var nx = -dy / (dist || 1);
        var ny = dx / (dist || 1);
        // Pick the direction that curves upward
        if (ny > 0) { nx = -nx; ny = -ny; }
        return { x: mx + nx * bulge, y: my + ny * bulge };
    }

    // Draw the simplified world map
    function drawMap(ctx, mapW, mapH, offsetX, offsetY, mapColor) {
        ctx.strokeStyle = mapColor;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';

        for (var c = 0; c < CONTINENTS.length; c++) {
            var pts = CONTINENTS[c];
            ctx.beginPath();
            for (var p = 0; p < pts.length; p++) {
                var pos = lonLatToXY(pts[p][0], pts[p][1], mapW, mapH, offsetX, offsetY);
                if (p === 0) {
                    ctx.moveTo(pos.x, pos.y);
                } else {
                    ctx.lineTo(pos.x, pos.y);
                }
            }
            ctx.closePath();
            ctx.fillStyle = hexToRgba(mapColor, 0.08);
            ctx.fill();
            ctx.stroke();
        }
    }

    // Draw a glowing dot for origin point
    function drawOriginDot(ctx, x, y, radius, color) {
        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.12);
        ctx.fill();

        // Middle glow
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.25);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Highlight
        ctx.beginPath();
        ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
    }

    // Draw pulsing venue marker
    function drawVenueMarker(ctx, x, y, baseRadius, color, pulsePhase) {
        var pulseScale = 1 + 0.3 * Math.sin(pulsePhase);
        var r = baseRadius * pulseScale;

        // Outer pulse ring
        ctx.beginPath();
        ctx.arc(x, y, r * 3, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(color, 0.15 + 0.1 * Math.sin(pulsePhase));
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;

        // Second ring
        ctx.beginPath();
        ctx.arc(x, y, r * 2, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(color, 0.3);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;

        // Glow
        ctx.beginPath();
        ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(color, 0.15);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Star shape (4-point) drawn over center
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(pulsePhase * 0.3);
        ctx.beginPath();
        for (var i = 0; i < 8; i++) {
            var angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
            var starR = (i % 2 === 0) ? r * 1.2 : r * 0.5;
            var sx = Math.cos(angle) * starR;
            var sy = Math.sin(angle) * starR;
            if (i === 0) {
                ctx.moveTo(sx, sy);
            } else {
                ctx.lineTo(sx, sy);
            }
        }
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.6);
        ctx.fill();
        ctx.restore();

        // White center
        ctx.beginPath();
        ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fill();
    }

    // Draw a curved arc from origin to destination
    function drawArc(ctx, x0, y0, x1, y1, cpx, cpy, color, alpha) {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cpx, cpy, x1, y1);
        ctx.strokeStyle = hexToRgba(color, alpha);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.lineWidth = 1;
    }

    // Draw volume legend
    function drawLegend(ctx, w, h, origins, arcColor) {
        if (origins.length === 0) return;

        var maxVol = 0;
        var minVol = Infinity;
        for (var i = 0; i < origins.length; i++) {
            if (origins[i].volume > maxVol) maxVol = origins[i].volume;
            if (origins[i].volume < minVol) minVol = origins[i].volume;
        }

        var legendX = 10;
        var legendY = h - 60;
        var legendW = 140;
        var legendH = 50;

        // Background
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.moveTo(legendX + 4, legendY);
        ctx.lineTo(legendX + legendW - 4, legendY);
        ctx.arcTo(legendX + legendW, legendY, legendX + legendW, legendY + 4, 4);
        ctx.lineTo(legendX + legendW, legendY + legendH - 4);
        ctx.arcTo(legendX + legendW, legendY + legendH, legendX + legendW - 4, legendY + legendH, 4);
        ctx.lineTo(legendX + 4, legendY + legendH);
        ctx.arcTo(legendX, legendY + legendH, legendX, legendY + legendH - 4, 4);
        ctx.lineTo(legendX, legendY + 4);
        ctx.arcTo(legendX, legendY, legendX + 4, legendY, 4);
        ctx.closePath();
        ctx.fill();

        // Title
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('BET VOLUME', legendX + 8, legendY + 6);

        // Gradient bar
        var barX = legendX + 8;
        var barY = legendY + 20;
        var barW = legendW - 16;
        var barH = 6;
        var grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, hexToRgba(arcColor, 0.3));
        grad.addColorStop(1, arcColor);
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, barW, barH);

        // Labels
        ctx.font = '8px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText(formatNumber(minVol), barX, barY + barH + 8);
        ctx.textAlign = 'right';
        ctx.fillText(formatNumber(maxVol), barX + barW, barY + barH + 8);

        // Reset
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
    }

    // ── Visualization Class ─────────────────────────────────────

    return SplunkVisualizationBase.extend({

        initialize: function() {
            SplunkVisualizationBase.prototype.initialize.apply(this, arguments);
            this.el.classList.add('bet-flow-map-viz');

            // Create canvas element
            this.canvas = document.createElement('canvas');
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.display = 'block';
            this.el.appendChild(this.canvas);

            // Internal state
            this._lastGoodData = null;
            this._animTimer = null;
            this._particles = [];
            this._tickCount = 0;
            this._pulsePhase = 0;
        },

        getInitialDataParams: function() {
            return {
                outputMode: SplunkVisualizationBase.ROW_MAJOR_OUTPUT_MODE,
                count: 10000
            };
        },

        formatData: function(data, config) {
            if (!data || !data.rows || data.rows.length === 0) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Awaiting data \u2014 Geographic Bet Flow Map'
                );
            }

            var fields = data.fields;
            var colIdx = {};
            for (var i = 0; i < fields.length; i++) {
                colIdx[fields[i].name] = i;
            }

            // Check for status message from appendpipe fallback
            if (colIdx._status !== undefined) {
                var statusRow = data.rows[data.rows.length - 1];
                var statusVal = statusRow[colIdx._status];
                if (statusVal) {
                    return { _status: statusVal };
                }
            }

            // Validate required columns
            if (colIdx.country === undefined || colIdx.lat === undefined ||
                colIdx.lon === undefined || colIdx.volume === undefined) {
                if (this._lastGoodData) return this._lastGoodData;
                throw new SplunkVisualizationBase.VisualizationError(
                    'Required columns: country, lat, lon, volume'
                );
            }

            // Build origins array from all rows
            var origins = [];
            var venueLat = 0;
            var venueLon = 0;
            var hasVenue = false;

            for (var r = 0; r < data.rows.length; r++) {
                var row = data.rows[r];
                var country = row[colIdx.country] || '';
                var lat = parseFloat(row[colIdx.lat]);
                var lon = parseFloat(row[colIdx.lon]);
                var volume = parseFloat(row[colIdx.volume]);

                if (!country || isNaN(lat) || isNaN(lon) || isNaN(volume)) continue;

                // Read venue from first row that has it
                if (!hasVenue && colIdx.venue_lat !== undefined && colIdx.venue_lon !== undefined) {
                    var vLat = parseFloat(row[colIdx.venue_lat]);
                    var vLon = parseFloat(row[colIdx.venue_lon]);
                    if (!isNaN(vLat) && !isNaN(vLon)) {
                        venueLat = vLat;
                        venueLon = vLon;
                        hasVenue = true;
                    }
                }

                origins.push({
                    country: country,
                    lat: lat,
                    lon: lon,
                    volume: volume
                });
            }

            var result = {
                origins: origins,
                venueLat: venueLat,
                venueLon: venueLon
            };

            this._lastGoodData = result;
            return result;
        },

        updateView: function(data, config) {
            // Custom no-data message
            if (data && data._status) {
                this._ensureCanvas();
                this._drawStatusMessage(data._status);
                this._stopAnimation();
                return;
            }

            if (!data) {
                if (this._lastGoodData) { data = this._lastGoodData; }
                else { return; }
            }

            if (!data.origins || data.origins.length === 0) return;

            // ── Read user settings ──
            var ns = this.getPropertyNamespaceInfo().propertyNamespace;
            var arcColor = config[ns + 'arcColor'] || '#0088ff';
            var venueColor = config[ns + 'venueColor'] || '#ff6600';
            var showLabels = (config[ns + 'showLabels'] || 'true') === 'true';
            var showMap = (config[ns + 'showMap'] || 'true') === 'true';
            var mapColor = config[ns + 'mapColor'] || '#1a2a3a';
            var animSpeed = config[ns + 'animSpeed'] || 'medium';
            var particleDensity = config[ns + 'particleDensity'] || 'medium';

            // ── Size canvas for HiDPI ──
            var el = this.el;
            var rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);

            var w = rect.width;
            var h = rect.height;

            // Store render state for animation
            this._renderState = {
                w: w,
                h: h,
                dpr: dpr,
                data: data,
                arcColor: arcColor,
                venueColor: venueColor,
                showLabels: showLabels,
                showMap: showMap,
                mapColor: mapColor,
                particleDensity: particleDensity
            };

            // Initialize particles if needed
            this._initParticles(data, particleDensity);

            // Draw the scene
            this._drawScene(ctx, w, h);

            // Start animation if not already running
            var interval = ANIM_INTERVALS[animSpeed] || 35;
            this._startAnimation(interval);
        },

        _initParticles: function(data, density) {
            var pCount = PARTICLE_COUNTS[density] || 6;
            var origins = data.origins;

            // Only reinit if origin count or density changed
            var expectedTotal = origins.length * pCount;
            if (this._particles.length === expectedTotal && this._lastDensity === density) return;
            this._lastDensity = density;

            this._particles = [];
            for (var i = 0; i < origins.length; i++) {
                for (var p = 0; p < pCount; p++) {
                    this._particles.push({
                        originIdx: i,
                        t: Math.random(),          // position along curve [0..1]
                        speed: 0.003 + Math.random() * 0.005,
                        size: 1 + Math.random() * 2,
                        alpha: 0.4 + Math.random() * 0.6
                    });
                }
            }
        },

        _drawScene: function(ctx, w, h) {
            var rs = this._renderState;
            if (!rs) return;

            var data = rs.data;
            var origins = data.origins;

            // Map layout: use 90% of canvas with margin
            var margin = Math.min(w, h) * 0.05;
            var mapW = w - margin * 2;
            var mapH = h - margin * 2;
            var offsetX = margin;
            var offsetY = margin;

            // ── Clear canvas with dark background ──
            ctx.fillStyle = '#0a0e14';
            ctx.fillRect(0, 0, w, h);

            // ── Draw map outline ──
            if (rs.showMap) {
                drawMap(ctx, mapW, mapH, offsetX, offsetY, rs.mapColor);
            }

            // ── Compute max volume for sizing ──
            var maxVol = 0;
            for (var i = 0; i < origins.length; i++) {
                if (origins[i].volume > maxVol) maxVol = origins[i].volume;
            }
            if (maxVol === 0) maxVol = 1;

            // ── Convert venue to screen coords ──
            var venueScreen = lonLatToXY(data.venueLon, data.venueLat, mapW, mapH, offsetX, offsetY);

            // ── Draw arcs and origin dots ──
            var arcData = [];
            for (var j = 0; j < origins.length; j++) {
                var o = origins[j];
                var volNorm = o.volume / maxVol;
                var originScreen = lonLatToXY(o.lon, o.lat, mapW, mapH, offsetX, offsetY);
                var cp = calcControlPoint(originScreen.x, originScreen.y, venueScreen.x, venueScreen.y);

                arcData.push({
                    ox: originScreen.x,
                    oy: originScreen.y,
                    cpx: cp.x,
                    cpy: cp.y,
                    vx: venueScreen.x,
                    vy: venueScreen.y,
                    volNorm: volNorm
                });

                // Draw arc
                var arcAlpha = 0.15 + volNorm * 0.35;
                drawArc(ctx, originScreen.x, originScreen.y, venueScreen.x, venueScreen.y,
                    cp.x, cp.y, rs.arcColor, arcAlpha);

                // Draw origin dot
                var dotRadius = 3 + volNorm * 5;
                drawOriginDot(ctx, originScreen.x, originScreen.y, dotRadius, rs.arcColor);

                // Draw label
                if (rs.showLabels) {
                    var fontSize = Math.max(8, Math.min(11, Math.min(w, h) * 0.022));
                    ctx.font = fontSize + 'px sans-serif';
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(o.country, originScreen.x, originScreen.y - dotRadius - 4);

                    // Volume number below dot
                    ctx.font = (fontSize - 1) + 'px monospace';
                    ctx.fillStyle = hexToRgba(rs.arcColor, 0.6);
                    ctx.textBaseline = 'top';
                    ctx.fillText(formatNumber(o.volume), originScreen.x, originScreen.y + dotRadius + 3);

                    ctx.textAlign = 'start';
                    ctx.textBaseline = 'alphabetic';
                }
            }

            // Store arc data for particle animation
            this._arcData = arcData;

            // ── Draw particles along arcs ──
            for (var k = 0; k < this._particles.length; k++) {
                var particle = this._particles[k];
                var ad = arcData[particle.originIdx];
                if (!ad) continue;

                var pt = bezierPoint(particle.t, ad.ox, ad.oy, ad.cpx, ad.cpy, ad.vx, ad.vy);

                // Particle glow
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, particle.size * 2, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(rs.arcColor, particle.alpha * 0.2);
                ctx.fill();

                // Particle core
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, particle.size, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(rs.arcColor, particle.alpha);
                ctx.fill();
            }

            // ── Draw venue marker (on top of everything) ──
            var venueRadius = Math.max(5, Math.min(w, h) * 0.015);
            drawVenueMarker(ctx, venueScreen.x, venueScreen.y, venueRadius, rs.venueColor, this._pulsePhase);

            // ── Draw venue label ──
            if (rs.showLabels) {
                var vFontSize = Math.max(9, Math.min(13, Math.min(w, h) * 0.028));
                ctx.font = 'bold ' + vFontSize + 'px sans-serif';
                ctx.fillStyle = hexToRgba(rs.venueColor, 0.9);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('VENUE', venueScreen.x, venueScreen.y - venueRadius * 3 - 4);
                ctx.textAlign = 'start';
                ctx.textBaseline = 'alphabetic';
            }

            // ── Draw legend ──
            drawLegend(ctx, w, h, origins, rs.arcColor);
        },

        _startAnimation: function(interval) {
            if (this._animTimer) return; // Already running

            var self = this;
            this._animTimer = setInterval(function() {
                self._tickCount++;
                self._pulsePhase += 0.08;

                // Update particles
                for (var i = 0; i < self._particles.length; i++) {
                    var p = self._particles[i];
                    p.t += p.speed;
                    if (p.t >= 1) {
                        p.t = 0;
                        p.speed = 0.003 + Math.random() * 0.005;
                        p.alpha = 0.4 + Math.random() * 0.6;
                    }
                }

                // Redraw
                var rs = self._renderState;
                if (!rs) return;

                var dpr = rs.dpr;
                self.canvas.width = rs.w * dpr;
                self.canvas.height = rs.h * dpr;
                var ctx = self.canvas.getContext('2d');
                if (!ctx) return;
                ctx.scale(dpr, dpr);

                self._drawScene(ctx, rs.w, rs.h);
            }, interval);
        },

        _stopAnimation: function() {
            if (this._animTimer) {
                clearInterval(this._animTimer);
                this._animTimer = null;
            }
        },

        // ── Custom no-data message support ──

        _ensureCanvas: function() {
            if (!this.canvas) {
                this.el.innerHTML = '';
                this.canvas = document.createElement('canvas');
                this.canvas.style.width = '100%';
                this.canvas.style.height = '100%';
                this.canvas.style.display = 'block';
                this.el.appendChild(this.canvas);
            }
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
        },

        _drawStatusMessage: function(message) {
            var rect = this.el.getBoundingClientRect();
            var dpr = window.devicePixelRatio || 1;
            var ctx = this.canvas.getContext('2d');
            if (!ctx) return;
            ctx.scale(dpr, dpr);
            var w = rect.width;
            var h = rect.height;
            ctx.clearRect(0, 0, w, h);

            // Dark background
            ctx.fillStyle = '#0a0e14';
            ctx.fillRect(0, 0, w, h);

            var maxTextW = w * 0.85;
            var fontSize = Math.max(10, Math.min(32, Math.min(w, h) * 0.09));
            var emojiSize = Math.round(fontSize * 1.6);
            var gap = fontSize * 0.5;

            ctx.font = '500 ' + fontSize + 'px sans-serif';
            while (ctx.measureText(message).width > maxTextW && fontSize > 8) {
                fontSize -= 1;
                emojiSize = Math.round(fontSize * 1.6);
                ctx.font = '500 ' + fontSize + 'px sans-serif';
            }

            // Football emoji above text
            ctx.font = emojiSize + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(255,255,255,1)';
            ctx.fillText('\u26BD', w / 2, h / 2 - fontSize * 0.5 - gap);

            // Message text below emoji
            ctx.font = '500 ' + fontSize + 'px sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText(message, w / 2, h / 2 + emojiSize * 0.3);

            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        },

        reflow: function() {
            this._stopAnimation();
            this.invalidateUpdateView();
        },

        destroy: function() {
            this._stopAnimation();
            SplunkVisualizationBase.prototype.destroy.apply(this, arguments);
        }
    });
});

import React, {
  useEffect,
  useRef,
  useState
} from "react";
import cornerstone from "cornerstone-core";
import cornerstoneMath from "cornerstone-math";
import cornerstoneTools from "cornerstone-tools";
import cornerstoneWebImageLoader from "cornerstone-web-image-loader";
import Hammer from "hammerjs";
import { Study } from "../types";
import utilStyles from '../styles/utils.module.css'
import { MdPanTool, MdSave, MdZoomIn } from "react-icons/md"
import {BiEraser, BiRotateRight, BiRuler, BiShapeTriangle} from "react-icons/bi"
import moment from "moment";

const leftMouseToolChain = [
  { name: "Pan", func: cornerstoneTools.PanTool, config: {} },
  { name: "Magnify", func: cornerstoneTools.MagnifyTool, config: {} },
  { name: "Angle", func: cornerstoneTools.AngleTool, config: {} },
  { name: "Length", func: cornerstoneTools.LengthTool, config: {} },
  { name: "Eraser", func: cornerstoneTools.EraserTool, config: {} }
];

interface Props {
  study: Study,
  loadState:(state) => void
};

export const CornerstoneElement = (props:Props) => {
  const [activeFrameIndex, setActiveFrameIndex] = useState(0);
  const [activeVersionIndex, setActiveVersionIndex] = useState(-1);
  const [isSaving, setIsSaving] = useState(false);
  const viewerRef = useRef(null);
  const [leftMouseTool, setLeftMouseTool] = useState(
    leftMouseToolChain[0].name
  );

  const frames = props.study.frames

  /**
   * useEffect runs every time the state of the page is changed including on the initial load.
   * Used here to initialize the Cornerstone object, setup the annotation tools, etc.
   */
  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    cornerstoneTools.external.cornerstone = cornerstone;
    cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
    cornerstoneWebImageLoader.external.cornerstone = cornerstone;
    cornerstoneTools.external.Hammer = Hammer;
    cornerstoneTools.init();
    cornerstone.enable(viewerRef.current);
    init();
    setTools();
    setEventListeners();

    async function init() {
      //This checks if Cornerstone has already been initialized
      if(!cornerstone.getActiveLayer(viewerRef.current)){
        //Load the first image and then create/add a layer to the Cornerstone object with the image
        cornerstone.loadAndCacheImage(frames[0].url)
        .then((image) => {
          cornerstone.addLayer(
            viewerRef.current,
            image,
            {
              visible: true,
              opacity: 1,
              name: "",
              viewport: {
                colormap: ""
              }
            }
          );
          cornerstone.updateImage(viewerRef.current);
        })
      }
    }

    function setTools() {
      if(!cornerstone.getActiveLayer(viewerRef.current)){
        // Setup the tools starting with Zoom
        const zoomTool = cornerstoneTools.ZoomTool;
        cornerstoneTools.addTool(zoomTool, {
          configuration: {
            invert: false,
            preventZoomOutsideImage: false,
            minScale: 0.1,
            maxScale: 20.0
          }
        });
        cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 2 });

        for (let i = 0; i < leftMouseToolChain.length; i++) {
          if (i === 0) {
            // Set the first tool in the list as active by default
            cornerstoneTools.addTool(leftMouseToolChain[i].func);
            cornerstoneTools.setToolActive(leftMouseToolChain[i].name, {
              mouseButtonMask: 1
            });
          } else {
            cornerstoneTools.addTool(leftMouseToolChain[i].func);
            cornerstoneTools.setToolPassive(leftMouseToolChain[i].name, {
              mouseButtonMask: 1
            });
          }
        }
      }
    }

    /**
     * Setup an event listener for the mousedrag. Primarily, left in as a starting point for future features.
     */
    function setEventListeners() {
      if(!cornerstone.getActiveLayer(viewerRef.current)){
        viewerRef.current.addEventListener(
          "cornerstonetoolsmousedrag",
          (event) => {
            console.log(event.detail)
          }
        );
      }
    }
  });

  const onClickRotation = () => {
    const viewport = cornerstone.getViewport(viewerRef.current);
    viewport.rotation += 90;
    cornerstone.setViewport(viewerRef.current, viewport);
  };

  /**
   * 
   * @param event Mouse click event
   * Called when a different image is selected. Updates activeFrameIndex React state,
   * resets the loadState (ie clear the annotations), and adds the new image to the layer.
   */
  const onChangeFrame = async(event) => {
    const index = event.target.value;

    setActiveFrameIndex(index);
    loadState(-1);

    let {layerId} = cornerstone.getActiveLayer(viewerRef.current);
    let image = await cornerstone.loadAndCacheImage(frames[index].url);

    cornerstone.setLayerImage(
      viewerRef.current,
      image,
      layerId
    );

    cornerstone.updateImage(viewerRef.current);
  };

  /**
   * 
   * @param toolName Pan | Magnify | Angle | Length | Eraser
   * Updates the active tool, sets all other tools to passive
   */
  const changeTool = (toolName:string) => {
    for (let i = 0; i < leftMouseToolChain.length; i++) {
      if (leftMouseToolChain[i].name === toolName) {
        cornerstoneTools.setToolActive(leftMouseToolChain[i].name, {
          mouseButtonMask: 1
        });
      } else {
        cornerstoneTools.setToolPassive(leftMouseToolChain[i].name, {
          mouseButtonMask: 1
        });
      }
    }

    cornerstone.updateImage(viewerRef.current);

    setLeftMouseTool(toolName);
  }  

  /**
   * Saves the state (ie annotations) to the DynamoDB via a POST request.
   */
  const saveState = async() => {
    setIsSaving(true);
    const toolStateManager = cornerstoneTools.getElementToolStateManager(viewerRef.current);

    let body = {
      "ia_demo":props.study.ia_demo,
      "frame_id":frames[activeFrameIndex].id,
      "state":toolStateManager.toolState
    }

    if(!isSaving){
      try{
        const res = await fetch(`https://mka3pn0td1.execute-api.us-east-1.amazonaws.com/default/ia-patient-study-list`, {
          method: 'POST',
          mode: 'no-cors',
          cache: 'no-cache',
          credentials: 'omit',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'qLE99fhPaJ5RWf7UspH5j4oe4auIMHir2j67W75a'
          },
          referrerPolicy: 'no-referrer',
          body: JSON.stringify(body)
        });
        setIsSaving(false);
      } catch(err){
        console.log('Error saving state', err);
        setIsSaving(false);
      }
    }
  }

  /**
   * 
   * @param index Position in the state_history array of the state to be loaded
   * Grabs the state at the given index and calls restoreToolState to apply the annotations of that state.
   */
  const loadState = (index) => {
    setActiveVersionIndex(index)

    const toolStateManager = cornerstoneTools.getElementToolStateManager(viewerRef.current);
    toolStateManager.restoreToolState(frames[activeFrameIndex]['state_history'][index]?.state || {});

    cornerstone.updateImage(viewerRef.current);
  }

  return (
    <div>
      <div>
        <div className={utilStyles.row}>
          <div>
            <button
              className={leftMouseTool==='Pan'?utilStyles.activeBtn:utilStyles.inactiveBtn}
              onClick={()=>{
                changeTool('Pan')
              }}
            >
              <MdPanTool title='Pan' size='1.5em' />
            </button>
            <button
              className={leftMouseTool==='Magnify'?utilStyles.activeBtn:utilStyles.inactiveBtn}
              onClick={()=>{
                changeTool('Magnify')
              }}
            >
              <MdZoomIn title='Magnify' size='1.5em' />
            </button>
            <button
              className={leftMouseTool==='Angle'?utilStyles.activeBtn:utilStyles.inactiveBtn}
              onClick={()=>{
                changeTool('Angle')
              }}
            >
              <BiShapeTriangle title='Angle' size='1.5em' />
            </button>
            <button
              className={leftMouseTool==='Length'?utilStyles.activeBtn:utilStyles.inactiveBtn}
              onClick={()=>{
                changeTool('Length')
              }}
            >
              <BiRuler title='Measure' size='1.5em' />
            </button>
            <button
              className={leftMouseTool==='Eraser'?utilStyles.activeBtn:utilStyles.inactiveBtn}
              onClick={()=>{
                changeTool('Eraser')
              }}
            >
              <BiEraser title='Erase' size='1.5em' />
            </button>
            |
            <button
              onClick={onClickRotation}
              style={{marginLeft:"5px"}}
            >
              <BiRotateRight title='Rotate 90&deg;' size='1.5em' />
            </button>
          </div>
          <div className={utilStyles.row} style={{marginTop:"-27px"}}>
            <div style={{marginRight:'5px'}}>
              <label htmlFor="frame">Frame: </label>
              <select id="frame" onChange={onChangeFrame} value={activeFrameIndex} style={{display:"block"}}>
                {frames.map((frame,idx)=>{
                  return (
                    <option key={idx} value={idx}>{frame.id}</option>
                  )
                })}
              </select>
            </div>
            <div>
              <label htmlFor="history" onClick={()=>{console.log(frames[activeFrameIndex], frames[activeFrameIndex][activeVersionIndex])}}>Annotation History:</label>
              <select id="history" onChange={(e)=>{loadState(e.target.value)}} value={activeVersionIndex} style={{display:"block"}}>
                <option key={-1} value={-1}>Current</option>
                {frames[activeFrameIndex]?.state_history?.map((sh,idx)=>{
                  return (
                    <option key={idx} value={idx}>{moment(sh.timestamp).format('MMM D, YYYY h:mm:ss a')}</option>
                  )
                })}
              </select>
            </div>
          </div>
          <button
            onClick={saveState}
            style={{display:"flex",alignItems:'center', marginRight: 0, backgroundColor:isSaving?'whitesmoke':'#11af49', borderColor:isSaving?'whitesmoke':'#0c7933'}}
            disabled={isSaving}
          >
            {isSaving?
              <span style={{color:'#000'}}>Saving...</span>
              :
              <div 
                style={{display:"flex",alignItems:'center',color:'white'}}
              >
                <MdSave title='Save' size='1.5em' /> &nbsp;Save
              </div>
            }
          </button>
        </div>
      </div>
      <div
        ref={viewerRef}
        id="viewer"
        style={{
          width: "800px",
          height: "595px"
        }}
      />
    </div>
  );
};
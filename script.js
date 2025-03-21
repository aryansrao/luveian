const dpr = window.devicePixelRatio
const canvas = document.createElement("canvas")

// Changed to append canvas to the container instead of clearing body
const container = document.querySelector('.container')
// Don't clear the entire body content
container.appendChild(canvas)
// Don't set body style here since we're handling it in CSS

canvas.style.width = "100%"
canvas.style.height = "100%"
canvas.style.objectFit = "contain"

// Flag for low performance mode
let isLowPerfMode = false;

// Device and performance detection
function detectDeviceCapabilities() {
  // Check if device is mobile
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   (window.innerWidth <= 768);
  
  // Check if device has low memory (iOS doesn't support navigator.deviceMemory)
  const hasLowMemory = navigator.deviceMemory && navigator.deviceMemory <= 4;
  
  // If mobile or low memory, enable low performance mode
  isLowPerfMode = isMobile || hasLowMemory;
  
  // Add class to body for CSS optimizations
  if (isLowPerfMode) {
    document.body.classList.add('low-perf-mode');
  }
  
  return isLowPerfMode;
}

// Run detection before initializing WebGL
detectDeviceCapabilities();

const vertexSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

in vec4 position;

void main(void) {
    gl_Position = position;
}
`
const fragmentSource = `#version 300 es
/*********
 * made by Matthias Hurrle (@atzedent) 
 */
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

out vec4 fragColor;

uniform vec2 resolution;
uniform float time;

#define T mod(2.*time, 180.)
#define S smoothstep

float rnd(float a) {
	return fract(sin(a*12.233)*78.599);
}

float rnd(vec2 p) {
	return fract(sin(dot(p,p.yx+vec2(234,543)))*345678.);
}

float curve(float a, float b) {
	a /= b;

	return mix(
		rnd(floor(a)),
		rnd(floor(a)+1.),
		pow(S(.0,1.,fract(a)),10.)
	);
}

mat2 rot(float a) {
	float s=sin(a), c=cos(a);
	return mat2(c,-s,s,c);
}

float map(vec3 p) {
  if (p.y > .28 || p.z > 15.) return 5e5;
  
	float d=p.y+(1.-cos(sin(T+6.3*p.x)))*.1;
	d += 1.-pow(cos(.75*sin(T+curve(T*.5,8.)+2.*(1.+curve(T*2.5,14.4))*(p.xz*rot(.125)).x)),2.);
	d += 1.-cos(curve(T*.2,8.)+sin(T+.8*(p.xz*rot(.38)).x))*.1;
	d += 1.2*sin(p.z*.4+sin(p.x*.6+1.2));
	
	d = max(d, -p.z);
	
	return d*.5;
}

vec3 norm(vec3 p) {
	float h=1e-3;
	vec2 k=vec2(-1,1);
	return normalize(
		k.xyy*map(p+k.xyy*h)+
		k.yxy*map(p+k.yxy*h)+
		k.yyx*map(p+k.yyx*h)+
		k.xxx*map(p+k.xxx*h)
	);
}

void cam(inout vec3 p) {
	p.xz*=rot(sin(T*.2)*.2);
}

void main(void) {
	vec2 uv = (
		gl_FragCoord.xy-.5*resolution
	)/min(resolution.x, resolution.y);

	vec3 col = vec3(0),
	p = vec3(0,0,-3),
	rd = normalize(vec3(uv,1));

	cam(p);
	cam(rd);

	// Mobile optimization: Use fewer steps for low performance devices
    float steps = ${isLowPerfMode ? '200.' : '400.'};
    float maxd = 15.;
    float dd=.0, diffuse=mix(.75,1.,rnd(p.xz));

	for (float i=.0; i<steps; i++) {
		float d=map(p)*diffuse;

		if (d<1e-3) break;
		if (d>maxd) {
			dd=maxd;
			break;
		}

		p += rd*d;
		dd += d;
	}

	vec3 n=norm(p),
	l = normalize(vec3(0,10,-.1));

	float
	dif=max(.0,dot(n,l)),
	fre=1.+max(.0,dot(-rd,n));

	col += vec3(.3,.2,.1);
	col += .2*pow(fre,3.2)*dif;

	col *= mix(col, vec3(0), 1.-exp(-125e-5*dd*dd*dd));
	
    fragColor = vec4(col,1);
}
`
function compile(shader, source) {
    gl.shaderSource(shader, source)
    gl.compileShader(shader);

    if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader))
    }
}

let gl, programs = [], vertices, buffer;

function setup() {
    gl = canvas.getContext("webgl2")
    const vs = gl.createShader(gl.VERTEX_SHADER)
    
    compile(vs, vertexSource)

    shaders = [fragmentSource]
    programs = shaders.map(() => gl.createProgram())
    
    for (let i = 0; i < shaders.length; i++) {
        let addr = gl.createShader(gl.FRAGMENT_SHADER)
        let program = programs[i]
        
        compile(addr, shaders[i])
        gl.attachShader(program, vs)
        gl.attachShader(program, addr)
        gl.linkProgram(program)
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error(gl.getProgramInfoLog(program))
        }
    }

    vertices = [
        -1.,-1., 1.,
        -1.,-1., 1.,
        -1., 1., 1.,
        -1., 1., 1.,
    ]

    buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)

    for (let program of programs) {
        const position = gl.getAttribLocation(program, "position")

        gl.enableVertexAttribArray(position)
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

        // uniforms come here...
        program.resolution = gl.getUniformLocation(program, "resolution")
        program.time = gl.getUniformLocation(program, "time")
    }
}

function dispose() {
    if (gl) {
        const ext = gl.getExtension("WEBGL_lose_context")
        if (ext) ext.loseContext()
        gl = null
    }
}

function draw(now, program) {
    // Get background color from CSS variables
    const rootStyle = getComputedStyle(document.documentElement);
    const bgColor = rootStyle.getPropertyValue('--bg-color').trim();
    
    // Parse the hex color to RGB (default to black if parsing fails)
    let r = 0, g = 0, b = 0;
    
    if (bgColor.startsWith('#')) {
        const hex = bgColor.substring(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16) / 255;
            g = parseInt(hex[1] + hex[1], 16) / 255;
            b = parseInt(hex[2] + hex[2], 16) / 255;
        } else if (hex.length === 6) {
            r = parseInt(hex.substring(0, 2), 16) / 255;
            g = parseInt(hex.substring(2, 4), 16) / 255;
            b = parseInt(hex.substring(4, 6), 16) / 255;
        }
    }
    
    gl.clearColor(r, g, b, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // uniforms come here...
    gl.uniform2f(program.resolution, canvas.width, canvas.height);
    gl.uniform1f(program.time, now*1e-3);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length * .5);
}

let animationFrame = null;
function loop(now) {
    // Skip rendering in extreme low memory conditions
    if (!document.hidden && (!isLowPerfMode || performance.memory === undefined || performance.memory.usedJSHeapSize < performance.memory.jsHeapSizeLimit * 0.8)) {
        draw(now, programs[0]);
    }
    
    animationFrame = requestAnimationFrame(loop);
}

function init() {
    dispose();
    setup();
    resize();
    loop(0);
    
    // Listen for visibility change to pause rendering when tab is not visible
    document.addEventListener('visibilitychange', handleVisibilityChange);
}

// Pause animation when tab is not visible to save resources
function handleVisibilityChange() {
    if (document.hidden) {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
    } else if (!animationFrame) {
        animationFrame = requestAnimationFrame(loop);
    }
}

function resize() {
    const {
        innerWidth: width,
        innerHeight: height
    } = window

    // Optimize DPR for mobile - use lower resolution for better performance
    const effectiveDpr = isLowPerfMode ? Math.min(dpr, 1) : Math.min(dpr, 2);
    
    canvas.width = Math.round(width * effectiveDpr);
    canvas.height = Math.round(height * effectiveDpr);

    if (gl) {
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
}

// Initialize after DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
  init();
  
  // Debounce function for performance-intensive operations
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // Throttle function for continuous events like scrolling
  function throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Use a debounce function for resize with larger delay on mobile
  const debouncedResize = debounce(resize, isLowPerfMode ? 300 : 200);
  window.addEventListener('resize', debouncedResize);
  
  // Improved touch detection for mobile devices
  const isTouchDevice = ('ontouchstart' in window) || 
                        (navigator.maxTouchPoints > 0) || 
                        (navigator.msMaxTouchPoints > 0);
  
  if (isTouchDevice) {
    document.body.classList.add('touch-device');
    
    // Adjust overlay heights for mobile browsers with dynamic toolbars
    function adjustOverlayHeight() {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    
    window.addEventListener('resize', adjustOverlayHeight);
    adjustOverlayHeight();
  }
  
  // Set up scroll progress indicator with throttling
  const overlays = document.querySelectorAll('.content-overlay');
  overlays.forEach(overlay => {
    overlay.addEventListener('scroll', throttle(function() {
      if (this.classList.contains('active')) {
        const scrollTop = this.scrollTop;
        const scrollHeight = this.scrollHeight;
        const clientHeight = this.clientHeight;
        const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
        
        const progressBar = this.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.style.width = scrollPercent + '%';
        }
        
        // Add animation for sections as they scroll into view
        // In low performance mode, limit the number of elements we animate
        const sections = isLowPerfMode 
          ? this.querySelectorAll('.strategy-section, .strategy-highlight')
          : this.querySelectorAll('.strategy-section, .strategy-card, .strategy-highlight');
        
        sections.forEach(section => {
          const rect = section.getBoundingClientRect();
          const isVisible = rect.top <= window.innerHeight * 0.9 && rect.bottom >= 0;
          
          if (isVisible && !section.classList.contains('animated')) {
            section.classList.add('animated');
            // Instead of applying inline styles, use a class for better performance
            section.classList.add('animate-in');
          }
        });
      }
    }, 100)); // Throttle to execute at most once every 100ms
  });
  
  // Lazily initialize non-critical UI interactions
  setTimeout(() => {
    // Allow CTA button in strategy overlay to open contact overlay
    document.querySelectorAll('.cta-button[data-overlay]').forEach(button => {
      button.addEventListener('click', function() {
        const targetOverlay = this.getAttribute('data-overlay') + '-overlay';
        const currentOverlay = this.closest('.content-overlay');
        
        // Close current overlay
        currentOverlay.classList.remove('active');
        document.querySelector('.dock > button.active').classList.remove('active');
        
        // Open target overlay
        document.getElementById(targetOverlay).classList.add('active');
        
        // Find and activate corresponding dock button
        const targetButton = document.querySelector(`.dock > button[data-overlay="${this.getAttribute('data-overlay')}"]`);
        if (targetButton) {
          targetButton.classList.add('active');
        }
      });
    });
    
    // FAQ Toggle Functionality
    const faqItems = document.querySelectorAll('.faq-item');
    if (faqItems.length > 0) {
      faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        question.addEventListener('click', () => {
          // Close other open FAQ items
          faqItems.forEach(otherItem => {
            if (otherItem !== item && otherItem.classList.contains('active')) {
              otherItem.classList.remove('active');
            }
          });
          
          // Toggle active class on clicked item
          item.classList.toggle('active');
        });
      });
    }
    
    // Portfolio filter functionality with performance optimization
    const filterButtons = document.querySelectorAll('.filter-button');
    const portfolioItems = document.querySelectorAll('.portfolio-item');
    
    if (filterButtons.length > 0 && portfolioItems.length > 0) {
      filterButtons.forEach(button => {
        button.addEventListener('click', () => {
          // Update active button
          filterButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          
          const filterValue = button.getAttribute('data-filter');
          
          // Use requestAnimationFrame for better performance
          requestAnimationFrame(() => {
            portfolioItems.forEach(item => {
              // Remove transition temporarily for better performance when bulk-changing many items
              if (isLowPerfMode) item.style.transition = 'none';
              
              const shouldShow = filterValue === 'all' || 
                               item.getAttribute('data-category').includes(filterValue);
              
              item.classList.toggle('hidden', !shouldShow);
              item.classList.toggle('visible', shouldShow);
            });
            
            // Force reflow before re-enabling transitions
            if (isLowPerfMode) {
              window.requestAnimationFrame(() => {
                portfolioItems.forEach(item => {
                  item.style.transition = '';
                });
              });
            }
          });
        });
      });
    }
  }, isLowPerfMode ? 1000 : 300); // Delay non-critical UI initialization
  
  // Project modal functionality - Updated for root level modal with performance optimizations
  const modal = document.getElementById('project-modal');
  const viewProjectButtons = document.querySelectorAll('.view-project-btn');
  const closeModal = document.querySelector('.close-modal');
  
  // Project details content - only keeping the two recent projects
  const projectData = {
    project1: {
      title: "Shyam Kemicals Website",
      client: "Manish Buchaisa",
      year: "2025",
      services: "Web Design, Development, Content Strategy, Google Ads",
      description: `
        <h3>Project Overview</h3>
        <p>Shyam Kemicals approached us needing a professional web presence that would showcase their chemical products and services. The website needed to be informative, easy to navigate, and establish their credibility in the industry.</p>
        <p>We delivered a comprehensive website solution that is currently live at <a href="https://www.shyamkemicals.com" target="_blank" style="color: var(--accent-color);">www.shyamkemicals.com</a>, featuring product catalogs, company information, and contact details.</p>
        
        <div class="project-testimonial">
          <p>"The website has significantly improved our online presence and helped us reach new customers. The team at Luveian understood our industry requirements and delivered a solution that perfectly represents our brand in the digital space."</p>
          <span class="testimonial-author">— Management Team, Shyam Kemicals</span>
        </div>
        
        <h3>Design & Development Approach</h3>
        <p>We focused on creating a clean, professional design that communicates trust and expertise, essential qualities in the chemical industry. The site architecture was organized to help visitors quickly find product information and technical specifications.</p>
        <p>The website was built with modern web technologies ensuring fast loading times, mobile responsiveness, and search engine optimization to improve the company's digital visibility.</p>
        
        <h3>Digital Marketing Campaign</h3>
        <p>In addition to website development, we managed Google Ads campaigns for Shyam Kemicals to increase their visibility in search results. Our targeted advertising strategy focused on industry-specific keywords, resulting in a significant increase in qualified leads and improved conversion rates for the client.</p>
        <p>The campaigns were carefully monitored and optimized regularly, ensuring the best possible ROI and helping Shyam Kemicals expand their market reach beyond their traditional customer base.</p>
      `
    },
    project2: {
      title: "King Rajasthan Royal Salon",
      client: "Aryan Kumar",
      year: "2025",
      services: "Logo Design, Brand Identity, Social Media Management, Meta Advertising",
      description: `
        <h3>Project Overview</h3>
        <p>King Rajasthan Royal Salon needed a distinctive logo that would convey the luxury and premium nature of their grooming services while incorporating elements that reflect their Rajasthani heritage.</p>
        <p>Our design team created a logo that combines regal elements with modern aesthetics, establishing a strong visual identity for the salon in a competitive market.</p>
        
        <div class="project-image">
          <img src="../clients/kingrajasthanroyal/logo.jpeg" alt="King Rajasthan Royal Salon Logo" class="showcase-image" onerror="this.src='./assets/krr-logo.png'; this.onerror=null;">
        </div>
        
        <div class="project-testimonial">
          <p>"The logo perfectly captures the essence of our salon - royal tradition combined with contemporary style. We've received numerous compliments from our clients, and it has helped establish our brand recognition in the local market."</p>
          <span class="testimonial-author">— Owner, King Rajasthan Royal Salon</span>
        </div>
        
        <h3>Design Process</h3>
        <p>We began with extensive research into Rajasthani royal symbolism and contemporary salon branding to find the perfect intersection. After exploring multiple concepts, we refined the design through several iterations based on client feedback.</p>
        <p>The final logo uses a color palette inspired by traditional Rajasthani art combined with elegant typography that communicates luxury and premium service.</p>
        
        <h3>Social Media Management & Advertising</h3>
        <p>Beyond creating their visual identity, we managed King Rajasthan Royal Salon's social media presence across multiple platforms. Our team developed a content strategy that showcased their premium services, highlighted customer testimonials, and engaged with the local community.</p>
        <p>We complemented organic social media growth with targeted Meta advertising campaigns on Facebook and Instagram. These campaigns were designed to reach potential customers in the salon's service area, resulting in increased appointment bookings and higher customer retention rates.</p>
      `
    }
  };

  // Open modal with project data - modified for better performance
  if (viewProjectButtons.length > 0 && modal) {
    viewProjectButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        const projectId = button.getAttribute('data-project');
        const projectContent = projectData[projectId];
        
        if (projectContent) {
          // Create the modal content with restructured HTML for fixed sidebar layout
          const modalBody = modal.querySelector('.modal-body');
          
          // In low performance mode, simplify the modal content
          if (isLowPerfMode) {
            modalBody.innerHTML = `
              <div class="project-header">
                <h2>${projectContent.title || 'Project Details'}</h2>
              </div>
              <div class="project-details">
                <div class="project-meta">
                  <div class="meta-item">
                    <h4>Client</h4>
                    <p>${projectContent.client || 'Confidential'}</p>
                  </div>
                  <div class="meta-item">
                    <h4>Year</h4>
                    <p>${projectContent.year || '2025'}</p>
                  </div>
                </div>
                <div class="project-description">
                  ${projectContent.description.replace(/<div class="project-testimonial">[\s\S]*?<\/div>/g, '') || '<p>Project details coming soon.</p>'}
                </div>
              </div>
            `;
          } else {
            modalBody.innerHTML = `
              <div class="project-header">
                <h2>${projectContent.title || 'Project Details'}</h2>
              </div>
              <div class="project-details">
                <div class="project-meta">
                  <div class="meta-item">
                    <h4>Client</h4>
                    <p>${projectContent.client || 'Confidential'}</p>
                  </div>
                  <div class="meta-item">
                    <h4>Year</h4>
                    <p>${projectContent.year || '2024'}</p>
                  </div>
                  <div class="meta-item">
                    <h4>Services</h4>
                    <p>${projectContent.services || 'Design Services'}</p>
                  </div>
                  <div class="meta-item">
                    <h4>Category</h4>
                    <p>${projectContent.category || getProjectCategory(projectId)}</p>
                  </div>
                </div>
                <div class="project-description">
                  ${projectContent.description || '<p>Project details coming soon.</p>'}
                </div>
              </div>
            `;
          }
          
          // Open the modal with improved animation
          modal.classList.add('active');
          document.body.classList.add('modal-open'); // Add class to body to prevent scrolling
        }
      });
    });
  }

  // Helper function to determine project category based on ID
  function getProjectCategory(projectId) {
    const portfolio = document.querySelector(`.portfolio-item[data-project="${projectId}"]`);
    if (portfolio) {
      const category = portfolio.closest('.portfolio-item').getAttribute('data-category');
      // Format category string to be more readable
      if (category) {
        return category
          .split(' ')
          .map(cat => cat.charAt(0).toUpperCase() + cat.slice(1))
          .join(', ');
      }
    }
    return 'Design & Development';
  }
  
  // Close modal with improved handling
  if (closeModal) {
    closeModal.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeProjectModal();
    });
  }
  
  // Close modal on outside click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeProjectModal();
      }
    });
  }
  
  // Close modal on escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
      closeProjectModal();
    }
  });
  
  // Function to close the project modal with cleanup
  function closeProjectModal() {
    if (!modal) return;
    
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
    
    // Clear content after animation completes to reduce memory usage
    setTimeout(() => {
      if (!modal.classList.contains('active')) {
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) modalBody.innerHTML = '';
      }
    }, 600);
  }
  
  // Add logo click event handler to open company overlay
  const logoContainer = document.querySelector('.logo-container');
  const companyOverlay = document.getElementById('company-overlay');
  
  if (logoContainer && companyOverlay) {
    // Use the entire logo container as clickable area for better mobile accessibility
    logoContainer.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Close any active overlays first
      const activeOverlays = document.querySelectorAll('.content-overlay.active');
      activeOverlays.forEach(overlay => {
        overlay.classList.remove('active');
      });
      
      // Remove active class from any active dock buttons
      const activeButtons = document.querySelectorAll('.dock > button.active');
      activeButtons.forEach(button => {
        button.classList.remove('active');
      });
      
      // Open the company overlay
      companyOverlay.classList.add('active');
      
      // Set up the progress bar for the company overlay
      companyOverlay.querySelector('.progress-bar').style.width = '0%';
    });
    
    // Add touch feedback for mobile
    logoContainer.addEventListener('touchstart', function() {
      this.classList.add('touch-active');
    });
    
    logoContainer.addEventListener('touchend', function() {
      this.classList.remove('touch-active');
    });
  }
  
  // Close overlay when clicking outside
  if (logoContainer && companyOverlay) {
    document.addEventListener('click', function(event) {
      if (companyOverlay.classList.contains('active') &&
          !event.target.closest('#company-overlay') &&
          !event.target.closest('.logo')) {
        companyOverlay.classList.remove('active');
      }
    });
    
    // Set up scroll progress for company overlay
    companyOverlay.addEventListener('scroll', throttle(function() {
      if (this.classList.contains('active')) {
        const scrollTop = this.scrollTop;
        const scrollHeight = this.scrollHeight;
        const clientHeight = this.clientHeight;
        const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
        
        const progressBar = this.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.style.width = scrollPercent + '%';
        }
        
        // Animate sections as they come into view
        const sections = this.querySelectorAll('.strategy-section, .strategy-highlight');
        sections.forEach(section => {
          const rect = section.getBoundingClientRect();
          const isVisible = rect.top <= window.innerHeight * 0.9 && rect.bottom >= 0;
          
          if (isVisible && !section.classList.contains('animated')) {
            section.classList.add('animated');
            section.classList.add('animate-in');
          }
        });
      }
    }, 100));
  }
  
  // Handle click suggestion auto-hide on mobile devices
  const clickSuggestion = document.querySelector('.click-suggestion');
  if (clickSuggestion) {
    // Check if we're on mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     (window.innerWidth <= 768);
    
    if (isMobile) {
      // Make sure it's visible initially
      clickSuggestion.style.opacity = '1';
      
      // Set a timeout to hide it after 5 seconds
      setTimeout(() => {
        // Stop the pulse animation first for a cleaner transition
        clickSuggestion.style.animation = 'none';
        
        // Create and apply a custom fade-out animation
        const fadeOut = `
          @keyframes fadeOutSuggestion {
            from {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
            to {
              opacity: 0;
              transform: translateY(5px) scale(0.95);
            }
          }
        `;
        
        // Insert the animation style
        const styleElement = document.createElement('style');
        styleElement.textContent = fadeOut;
        document.head.appendChild(styleElement);
        
        // Apply the animation
        clickSuggestion.style.animation = 'fadeOutSuggestion 0.6s ease forwards';
        
        // Set pointer-events to none during fade out to prevent clicks on invisible element
        clickSuggestion.style.pointerEvents = 'none';
        
        // Remove from layout after animation completes to prevent it taking up space
        setTimeout(() => {
          clickSuggestion.style.display = 'none';
          clickSuggestion.style.visibility = 'hidden';
          clickSuggestion.style.height = '0';
          clickSuggestion.style.margin = '0';
          clickSuggestion.style.padding = '0';
          
          // Clean up by removing the temporary style element
          document.head.removeChild(styleElement);
        }, 600); // Match the CSS transition duration
      }, 5000);
    }
  }
});